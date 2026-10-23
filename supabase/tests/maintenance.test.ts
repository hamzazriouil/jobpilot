import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, insertJob, type TestDb } from './helpers';

// The §7 statements, verbatim from docs/02-DATABASE.md (fails if the doc block moves).
const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../docs/02-DATABASE.md'), 'utf8');
const MAINTENANCE_SQL = /## 7\. Maintenance[\s\S]*?```sql\r?\n([\s\S]*?)```/.exec(doc)?.[1];

let t: TestDb | undefined;
afterAll(async () => {
  await t?.close();
});

async function fixture(db: TestDb) {
  const u = await db.createUser();
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  const ids = {
    stale: await insertJob(db, { postedAt: ago(50) }), // -> gets expires_at
    staleNoPostedAt: await insertJob(db, { postedAt: null }),
    fresh: await insertJob(db, { postedAt: ago(10) }),
    longExpired: await insertJob(db, { expiresAt: ago(20) }), // -> deleted
    longExpiredTracked: await insertJob(db, { expiresAt: ago(20) }), // kept: tracked
    recentlyExpired: await insertJob(db, { expiresAt: ago(5) }), // kept: < 15 days
    privateOld: await insertJob(db, { ownerId: u, postedAt: ago(100), expiresAt: ago(100) }), // never touched
  };
  await db.db.query(`update public.jobs set ingested_at = now() - interval '60 days' where id = $1`, [ids.staleNoPostedAt]);
  await db.db.query(`insert into public.applications (user_id, job_id) values ($1, $2)`, [u, ids.longExpiredTracked]);
  await db.db.query(
    `insert into public.llm_calls (feature, provider, model, created_at)
     values ('analyze','p','m', now() - interval '91 days'), ('analyze','p','m', now() - interval '1 day')`,
  );
  await db.db.query(
    `insert into public.usage_counters (subject, day, feature, count)
     values ('ip:old', current_date - 8, 'analyze', 3), ('ip:new', current_date - 7, 'analyze', 3)`,
  );
  return ids;
}

describe('maintenance (§7)', () => {
  beforeEach(async () => {
    await t?.close();
    t = await createTestDb();
  });

  it('the documented SQL runs without error', async () => {
    expect(MAINTENANCE_SQL).toBeTruthy();
    await fixture(t!);
    await t!.db.exec(MAINTENANCE_SQL!);
  });

  it('run_maintenance() expires, deletes and keeps the right rows (service role only)', async () => {
    const ids = await fixture(t!);
    await expect(t!.as('authenticated', null, () => t!.db.query('select public.run_maintenance()'))).rejects.toThrow(
      /permission denied/,
    );
    const { rows } = await t!.as('service_role', null, () =>
      t!.db.query<{ r: Record<string, number> }>('select public.run_maintenance() as r'),
    );
    expect(rows[0]!.r).toEqual({
      jobs_expired: 2, // stale + staleNoPostedAt (falls back to ingested_at)
      jobs_deleted: 1, // longExpired
      llm_calls_deleted: 1,
      usage_counters_deleted: 1,
    });

    const jobs = await t!.db.query<{ id: string; expires_at: Date | null }>('select id, expires_at from public.jobs');
    const byId = new Map(jobs.rows.map((r) => [r.id, r.expires_at]));
    expect(byId.has(ids.longExpired)).toBe(false);
    for (const k of ['longExpiredTracked', 'recentlyExpired', 'privateOld', 'fresh'] as const) {
      expect(byId.has(ids[k]), k).toBe(true);
    }
    expect(byId.get(ids.stale)).toBeInstanceOf(Date);
    expect(byId.get(ids.staleNoPostedAt)).toBeInstanceOf(Date);
    expect(byId.get(ids.fresh)).toBeNull();
  });
});
