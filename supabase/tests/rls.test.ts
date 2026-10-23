import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, insertAnalysis, insertJob, type TestDb } from './helpers';

let t: TestDb;
let A: string;
let B: string;
let publicJob: string;
let privateJobA: string;
let analysisA: string;
let analysisB: string;

beforeAll(async () => {
  t = await createTestDb();
  A = await t.createUser({ email: 'a@example.com' });
  B = await t.createUser({ email: 'b@example.com' });
  publicJob = await insertJob(t, { title: 'public' });
  privateJobA = await insertJob(t, { title: 'private A', ownerId: A });
  analysisA = await insertAnalysis(t, A, publicJob);
  analysisB = await insertAnalysis(t, B, publicJob);
  await t.db.query(`insert into public.applications (user_id, job_id, stage) values ($1, $2, 'applied'), ($3, $2, 'saved')`, [
    A, publicJob, B,
  ]);
  await t.db.query(
    `insert into public.drafts (user_id, analysis_id, kind, content, provider, model, prompt_version)
     values ($1, $2, 'cover_letter', 'A letter', 'p', 'm', 'v1'), ($3, $4, 'cover_letter', 'B letter', 'p', 'm', 'v1')`,
    [A, analysisA, B, analysisB],
  );
  await t.db.query(
    `insert into public.daily_matches (user_id, job_id, match_date, similarity, rank)
     values ($1, $2, current_date, 0.9, 1), ($3, $2, current_date, 0.8, 1)`,
    [A, publicJob, B],
  );
  await t.db.query(
    `insert into public.entitlements (user_id, plan, starts_at, ends_at)
     values ($1, 'sprint30', now(), now() + interval '30 days')`,
    [B],
  );
  await t.db.query(
    `insert into public.payments (user_id, dodo_payment_id, product_id, plan, amount_cents, currency, status)
     values ($1, 'pay_1', 'prod', 'sprint30', 900, 'USD', 'succeeded')`,
    [B],
  );
  await t.db.query(`insert into public.usage_counters (subject, feature, count) values ('ip:x', 'analyze', 1)`);
  await t.db.query(`insert into public.llm_calls (feature, provider, model) values ('analyze', 'p', 'm')`);
  await t.db.query(`insert into public.webhook_events (id, type) values ('wh_1', 'payment.succeeded')`);
});
afterAll(async () => {
  await t?.close();
});

const q = async <R = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await t.db.query<R>(sql, params)).rows;
const asA = <T>(fn: () => Promise<T>) => t.as('authenticated', A, fn);
const asB = <T>(fn: () => Promise<T>) => t.as('authenticated', B, fn);

describe('RLS: own rows only', () => {
  it.each([
    ['applications', 'user_id'],
    ['analyses', 'user_id'],
    ['drafts', 'user_id'],
    ['application_events', 'user_id'],
    ['daily_matches', 'user_id'],
    ['profiles', 'id'],
  ])('%s: A sees only A rows', async (table, col) => {
    const rows = await asA(() => q<{ owner: string }>(`select ${col} as owner from public.${table}`));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.owner === A)).toBe(true);
  });

  it('entitlements and payments are visible to their owner only', async () => {
    expect(await asA(() => q('select * from public.entitlements'))).toHaveLength(0);
    expect(await asA(() => q('select * from public.payments'))).toHaveLength(0);
    expect(await asB(() => q('select * from public.entitlements'))).toHaveLength(1);
    expect(await asB(() => q('select * from public.payments'))).toHaveLength(1);
  });

  it("A cannot update or delete B's application", async () => {
    await asA(() => q(`update public.applications set notes = 'pwned' where user_id = $1`, [B]));
    await asA(() => q(`delete from public.applications where user_id = $1`, [B]));
    const rows = await q<{ notes: string | null }>(`select notes from public.applications where user_id = $1`, [B]);
    expect(rows).toEqual([{ notes: null }]);
  });

  it('service_role bypasses RLS', async () => {
    const rows = await t.as('service_role', null, () => q('select * from public.applications'));
    expect(rows).toHaveLength(2);
  });
});

describe('RLS: jobs', () => {
  it('public jobs are readable by any signed-in user; a pasted job only by its owner', async () => {
    const aJobs = await asA(() => q<{ id: string }>('select id from public.jobs'));
    const bJobs = await asB(() => q<{ id: string }>('select id from public.jobs'));
    expect(aJobs.map((r) => r.id).sort()).toEqual([publicJob, privateJobA].sort());
    expect(bJobs.map((r) => r.id)).toEqual([publicJob]);
  });

  it('anonymous users cannot read jobs', async () => {
    await expect(t.as('anon', null, () => q('select * from public.jobs'))).rejects.toThrow(/permission denied/);
  });

  it("B cannot track A's private job, nor create rows for A", async () => {
    await expect(
      asB(() => q(`insert into public.applications (user_id, job_id) values ($1, $2)`, [B, privateJobA])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asB(() => q(`insert into public.applications (user_id, job_id) values ($1, $2)`, [A, privateJobA])),
    ).rejects.toThrow(/row-level security/);
  });

  it("B cannot link A's analysis to an application", async () => {
    const job = await insertJob(t);
    await expect(
      asB(() =>
        q(`insert into public.applications (user_id, job_id, analysis_id) values ($1, $2, $3)`, [B, job, analysisA]),
      ),
    ).rejects.toThrow(/row-level security/);
    const ok = await asB(() =>
      q(`insert into public.applications (user_id, job_id, analysis_id) values ($1, $2, $3) returning id`, [
        B, job, analysisB,
      ]),
    );
    expect(ok).toHaveLength(1);
  });

  it('clients cannot write jobs, analyses or drafts (server-only)', async () => {
    await expect(
      asA(() =>
        q(`insert into public.jobs (source_id, title, description, content_hash, owner_id)
           values ('user_paste', 't', 'd', 'h', $1)`, [A]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asA(() => q(`update public.analyses set score = 100`))).rejects.toThrow(/permission denied/);
    await expect(asA(() => q(`delete from public.drafts`))).rejects.toThrow(/permission denied/);
  });
});

describe('profiles: column-level privileges', () => {
  it('a client can update its own editable fields', async () => {
    await asA(() => q(`update public.profiles set display_name = 'Alice', target_roles = '{AI engineer}' where id = $1`, [A]));
    const rows = await q<{ display_name: string }>('select display_name from public.profiles where id = $1', [A]);
    expect(rows[0]!.display_name).toBe('Alice');
  });

  it.each(['profile_version = 99', 'cv_parsed = \'{}\'', 'embedding = null', 'id = gen_random_uuid()'])(
    'a client cannot set %s',
    async (assignment) => {
      await expect(asA(() => q(`update public.profiles set ${assignment} where id = $1`, [A]))).rejects.toThrow(
        /permission denied/,
      );
    },
  );

  it("a client cannot change another user's profile, insert or delete profiles", async () => {
    await asA(() => q(`update public.profiles set display_name = 'x' where id = $1`, [B]));
    const rows = await q<{ display_name: string }>('select display_name from public.profiles where id = $1', [B]);
    expect(rows[0]!.display_name).toBe('b');
    await expect(asA(() => q(`delete from public.profiles where id = $1`, [A]))).rejects.toThrow(/permission denied/);
    await expect(asA(() => q(`insert into public.profiles (id) values (gen_random_uuid())`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('the server (service role) can set profile_version / embedding / cv_parsed', async () => {
    await t.as('service_role', null, () =>
      q(`update public.profiles set profile_version = profile_version + 1, cv_parsed = '{}' where id = $1`, [A]),
    );
    const rows = await q<{ profile_version: number }>('select profile_version from public.profiles where id = $1', [A]);
    expect(rows[0]!.profile_version).toBe(2);
  });
});

describe('daily_matches: dismiss only', () => {
  it('a client can dismiss its own match but not edit scores', async () => {
    await asA(() => q(`update public.daily_matches set dismissed = true where user_id = $1`, [A]));
    expect((await q<{ dismissed: boolean }>('select dismissed from public.daily_matches where user_id = $1', [A]))[0]!
      .dismissed).toBe(true);
    await expect(asA(() => q(`update public.daily_matches set rank = 0 where user_id = $1`, [A]))).rejects.toThrow(
      /permission denied/,
    );
    // B's match is untouched by A
    await asA(() => q(`update public.daily_matches set dismissed = true where user_id = $1`, [B]));
    expect((await q<{ dismissed: boolean }>('select dismissed from public.daily_matches where user_id = $1', [B]))[0]!
      .dismissed).toBe(false);
  });
});

describe('feedback, public tables and system tables', () => {
  it('anyone can insert feedback; nobody can read it through the API', async () => {
    await t.as('anon', null, () => q(`insert into public.feedback (kind, comment) values ('other', 'hi')`));
    await expect(
      t.as('anon', null, () => q(`insert into public.feedback (user_id, kind) values ($1, 'other')`, [A])),
    ).rejects.toThrow(/row-level security/);
    await asA(() => q(`insert into public.feedback (user_id, kind) values ($1, 'score_wrong')`, [A]));
    await expect(
      asA(() => q(`insert into public.feedback (user_id, kind) values ($1, 'other')`, [B])),
    ).rejects.toThrow(/row-level security/);
    await expect(asA(() => q('select * from public.feedback'))).rejects.toThrow(/permission denied/);
    expect(await q('select * from public.feedback')).toHaveLength(2);
  });

  it('sources and eval_runs are public (anon included)', async () => {
    expect(await t.as('anon', null, () => q('select * from public.sources'))).toHaveLength(7);
    expect(await t.as('anon', null, () => q('select * from public.eval_runs'))).toHaveLength(0);
    await expect(t.as('anon', null, () => q(`update public.sources set enabled = true`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each(['usage_counters', 'llm_calls', 'webhook_events'])('%s is service-role only', async (table) => {
    await expect(asA(() => q(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
    await expect(t.as('anon', null, () => q(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
    expect(await t.as('service_role', null, () => q(`select * from public.${table}`))).toHaveLength(1);
  });
});
