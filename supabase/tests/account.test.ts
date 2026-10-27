import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, insertAnalysis, insertJob, type TestDb } from './helpers';

// DELETE /api/account deletes the auth user; everything the user owns must go with it (PRD F1.10,
// roadmap W17 "Delete account removes everything (tested)"). Payments stay for accounting with
// user_id set to null, and llm_calls stay (cost logs) with user_id set to null.

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t?.close();
});

const count = async (sql: string, params: unknown[]) => (await t.db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, params)).rows[0]!.n;

/** A user with one row in every table that holds user data; returns their id and the ids to check. */
async function fullUser() {
  const u = await t.createUser();
  await t.db.query(`update public.profiles set cv_text = 'my cv', country_code = 'MA' where id = $1`, [u]);
  const publicJob = await insertJob(t);
  const pastedJob = await insertJob(t, { ownerId: u });
  const analysis = await insertAnalysis(t, u, publicJob);
  const app = (
    await t.db.query<{ id: string }>(
      `insert into public.applications (user_id, job_id, analysis_id, stage) values ($1, $2, $3, 'applied') returning id`,
      [u, publicJob, analysis],
    )
  ).rows[0]!.id;
  await t.db.query(`update public.applications set stage = 'replied' where id = $1`, [app]);
  await t.db.query(
    `insert into public.drafts (user_id, analysis_id, kind, content, provider, model, prompt_version)
     values ($1, $2, 'cover_letter', 'letter', 'p', 'm', 'v')`,
    [u, analysis],
  );
  await t.db.query(
    `insert into public.drafts (user_id, application_id, kind, content, provider, model, prompt_version)
     values ($1, $2, 'follow_up', 'nudge', 'p', 'm', 'v')`,
    [u, app],
  );
  await t.db.query(`insert into public.daily_matches (user_id, job_id, match_date, similarity, rank) values ($1, $2, current_date, 0.8, 1)`, [u, publicJob]);
  await t.db.query(`insert into public.feedback (user_id, kind) values ($1, 'other')`, [u]);
  const payment = (
    await t.db.query<{ id: string }>(
      `insert into public.payments (user_id, dodo_payment_id, product_id, plan, amount_cents, currency, status)
       values ($1, $2, 'prod', 'sprint30', 700, 'USD', 'succeeded') returning id`,
      [u, `pay_${u}`],
    )
  ).rows[0]!.id;
  await t.db.query(
    `insert into public.entitlements (user_id, plan, starts_at, ends_at, payment_id) values ($1, 'sprint30', now(), now() + interval '30 days', $2)`,
    [u, payment],
  );
  await t.db.query(`insert into public.llm_calls (user_id, feature, provider, model) values ($1, 'analyze', 'p', 'm')`, [u]);
  return { u, publicJob, pastedJob, app, payment };
}

describe('deleting an account', () => {
  it('removes every row the user owns, keeps payments and LLM cost logs anonymized, and leaves others alone', async () => {
    const victim = await fullUser();
    const other = await fullUser();

    await t.db.query('delete from auth.users where id = $1', [victim.u]);

    for (const table of ['analyses', 'drafts', 'applications', 'application_events', 'daily_matches', 'feedback', 'entitlements']) {
      expect(await count(`public.${table} where user_id = $1`, [victim.u]), table).toBe(0);
    }
    expect(await count('public.profiles where id = $1', [victim.u])).toBe(0);
    expect(await count('public.jobs where owner_id = $1', [victim.u])).toBe(0); // pasted job gone
    expect(await count('public.jobs where id = $1', [victim.publicJob])).toBe(1); // public job stays
    expect(await count('public.payments where id = $1 and user_id is null', [victim.payment])).toBe(1);
    expect(await count('public.llm_calls where user_id = $1', [victim.u])).toBe(0);

    // The other user is untouched.
    expect(await count('public.applications where user_id = $1', [other.u])).toBe(1);
    expect(await count('public.drafts where user_id = $1', [other.u])).toBe(2);
    expect(await count('public.jobs where owner_id = $1', [other.u])).toBe(1);
  });

  it('a user removing a tracked job also removes its stage log and follow-up drafts', async () => {
    const { u, app } = await fullUser();
    await t.as('authenticated', u, () => t.db.query('delete from public.applications where id = $1', [app]));
    expect(await count('public.applications where id = $1', [app])).toBe(0);
    expect(await count('public.application_events where application_id = $1', [app])).toBe(0);
    expect(await count(`public.drafts where user_id = $1 and kind = 'follow_up'`, [u])).toBe(0);
    expect(await count(`public.drafts where user_id = $1 and kind = 'cover_letter'`, [u])).toBe(1);
  });
});
