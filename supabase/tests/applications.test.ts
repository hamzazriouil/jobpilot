import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, insertJob, type TestDb } from './helpers';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t?.close();
});

type App = { id: string; applied_at: Date | null; follow_up_ok: boolean; follow_up_due_at: unknown };
type Ev = { from_stage: string | null; to_stage: string };

const events = async (appId: string) =>
  (
    await t.db.query<Ev>(
      'select from_stage, to_stage from public.application_events where application_id = $1 order by id',
      [appId],
    )
  ).rows;

const insertApp = async (userId: string, jobId: string, stage: string, extra = '') =>
  (
    await t.db.query<App>(
      `insert into public.applications (user_id, job_id, stage${extra ? ', follow_up_due_at' : ''})
       values ($1, $2, $3${extra ? `, ${extra}` : ''})
       returning id, applied_at, follow_up_due_at,
                 follow_up_due_at = (now() + interval '5 days')::date as follow_up_ok`,
      [userId, jobId, stage],
    )
  ).rows[0]!;

describe('applications triggers', () => {
  it("inserting as 'applied' sets applied_at, follow_up_due_at (+5 days) and logs an event", async () => {
    const u = await t.createUser();
    const job = await insertJob(t);
    const app = await insertApp(u, job, 'applied');
    expect(app.applied_at).toBeInstanceOf(Date);
    expect(app.follow_up_ok).toBe(true);
    expect(await events(app.id)).toEqual([{ from_stage: null, to_stage: 'applied' }]);
  });

  it('keeps an explicit follow_up_due_at', async () => {
    const u = await t.createUser();
    const job = await insertJob(t);
    const app = await insertApp(u, job, 'applied', `current_date + 2`);
    expect(app.follow_up_ok).toBe(false);
    const { rows } = await t.db.query<{ ok: boolean }>(
      'select follow_up_due_at = current_date + 2 as ok from public.applications where id = $1',
      [app.id],
    );
    expect(rows[0]!.ok).toBe(true);
  });

  it('a stage update logs from/to; non-stage updates log nothing', async () => {
    const u = await t.createUser();
    const job = await insertJob(t);
    const app = await insertApp(u, job, 'saved');
    expect(app.applied_at).toBeNull();
    expect(app.follow_up_due_at).toBeNull();

    await t.db.query(`update public.applications set stage = 'applied' where id = $1`, [app.id]);
    const { rows } = await t.db.query<{ applied: boolean; follow_ok: boolean }>(
      `select applied_at is not null as applied,
              follow_up_due_at = (now() + interval '5 days')::date as follow_ok
       from public.applications where id = $1`,
      [app.id],
    );
    expect(rows[0]).toEqual({ applied: true, follow_ok: true });

    await t.db.query(`update public.applications set notes = 'hi', position = 2 where id = $1`, [app.id]);
    await t.db.query(`update public.applications set stage = 'interviewing' where id = $1`, [app.id]);

    expect(await events(app.id)).toEqual([
      { from_stage: null, to_stage: 'saved' },
      { from_stage: 'saved', to_stage: 'applied' },
      { from_stage: 'applied', to_stage: 'interviewing' },
    ]);
  });

  it('works for a signed-in client writing through RLS (event log is written by the definer trigger)', async () => {
    const u = await t.createUser();
    const job = await insertJob(t);
    const evs = await t.as('authenticated', u, async () => {
      const { rows } = await t.db.query<{ id: string }>(
        `insert into public.applications (user_id, job_id, stage) values ($1, $2, 'saved') returning id`,
        [u, job],
      );
      const id = rows[0]!.id;
      await t.db.query(`update public.applications set stage = 'applied' where id = $1`, [id]);
      return (
        await t.db.query<Ev>(
          'select from_stage, to_stage from public.application_events where application_id = $1 order by id',
          [id],
        )
      ).rows;
    });
    expect(evs).toEqual([
      { from_stage: null, to_stage: 'saved' },
      { from_stage: 'saved', to_stage: 'applied' },
    ]);
  });

  it('one application per user+job', async () => {
    const u = await t.createUser();
    const job = await insertJob(t);
    await insertApp(u, job, 'saved');
    await expect(insertApp(u, job, 'saved')).rejects.toThrow(/duplicate key/);
  });
});
