import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './helpers';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t?.close();
});

const consume = async (subject: string, feature: string, limit: number) =>
  (
    await t.db.query<{ ok: boolean }>('select public.consume_quota($1, $2, $3) as ok', [
      subject,
      feature,
      limit,
    ])
  ).rows[0]!.ok;

describe('consume_quota', () => {
  it('allows exactly N calls, then returns false', async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consume('ip:aaa', 'analyze', 3));
    expect(results).toEqual([true, true, true, false, false]);
    const { rows } = await t.db.query<{ count: number }>(
      `select count from public.usage_counters where subject = 'ip:aaa' and feature = 'analyze'`,
    );
    expect(rows[0]!.count).toBe(3); // denied calls do not increment
  });

  it('is independent per subject and per feature', async () => {
    expect(await consume('user:1', 'analyze', 1)).toBe(true);
    expect(await consume('user:1', 'analyze', 1)).toBe(false);
    expect(await consume('user:2', 'analyze', 1)).toBe(true); // other subject
    expect(await consume('user:1', 'draft', 1)).toBe(true); // other feature
  });

  it('is independent per day', async () => {
    await t.db.query(
      `insert into public.usage_counters (subject, day, feature, count)
       values ('user:3', current_date - 1, 'analyze', 5)`,
    );
    expect(await consume('user:3', 'analyze', 5)).toBe(true); // yesterday's usage doesn't count
    const { rows } = await t.db.query<{ today: boolean; count: number }>(
      `select (day = current_date) as today, count from public.usage_counters
       where subject = 'user:3' order by day`,
    );
    expect(rows).toEqual([
      { today: false, count: 5 },
      { today: true, count: 1 },
    ]);
  });

  it('a limit of 0 always denies and writes nothing', async () => {
    expect(await consume('user:4', 'analyze', 0)).toBe(false);
    const { rows } = await t.db.query(`select 1 from public.usage_counters where subject = 'user:4'`);
    expect(rows).toHaveLength(0);
  });

  it('is callable by service_role only', async () => {
    await expect(t.as('anon', null, () => consume('ip:x', 'analyze', 3))).rejects.toThrow(/permission denied/);
    const uid = await t.createUser();
    await expect(t.as('authenticated', uid, () => consume(`user:${uid}`, 'analyze', 3))).rejects.toThrow(
      /permission denied/,
    );
    expect(await t.as('service_role', null, () => consume('ip:svc', 'analyze', 3))).toBe(true);
  });
});

describe('current_plan', () => {
  const plan = async (user: string) =>
    (
      await t.db.query<{ plan: string; ends_at: Date | null }>('select * from public.current_plan($1)', [user])
    ).rows;
  const grant = (user: string, p: 'sprint30' | 'sprint90', starts: string, ends: string) =>
    t.db.query(
      `insert into public.entitlements (user_id, plan, starts_at, ends_at)
       values ($1, $2, now() + $3::interval, now() + $4::interval)`,
      [user, p, starts, ends],
    );
  it("returns 'free' (one row, null ends_at) with no entitlement", async () => {
    const u = await t.createUser();
    expect(await plan(u)).toEqual([{ plan: 'free', ends_at: null }]);
  });

  it("returns 'sprint30' with an active entitlement", async () => {
    const u = await t.createUser();
    await grant(u, 'sprint30', '-1 day', '29 days');
    const rows = await plan(u);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.plan).toBe('sprint30');
    expect(rows[0]!.ends_at).toBeInstanceOf(Date);
  });

  it('returns the latest end date when passes overlap', async () => {
    const u = await t.createUser();
    await grant(u, 'sprint30', '-1 day', '10 days');
    await grant(u, 'sprint90', '-1 day', '80 days');
    const rows = await plan(u);
    const { rows: max } = await t.db.query<{ m: Date }>(
      'select max(ends_at) m from public.entitlements where user_id = $1',
      [u],
    );
    expect(rows[0]!.plan).toBe('sprint90');
    expect(rows[0]!.ends_at!.getTime()).toBe(max[0]!.m.getTime());
  });

  it('returns the end of the last pass when passes are stacked back-to-back', async () => {
    const u = await t.createUser();
    await grant(u, 'sprint30', '-1 day', '29 days');
    await grant(u, 'sprint30', '29 days', '59 days'); // bought while the first was active
    const rows = await plan(u);
    const { rows: max } = await t.db.query<{ m: Date }>(
      'select max(ends_at) m from public.entitlements where user_id = $1',
      [u],
    );
    expect(rows[0]!.plan).toBe('sprint30');
    expect(rows[0]!.ends_at!.getTime()).toBe(max[0]!.m.getTime());
  });

  it("returns 'free' after expiry and before a future pass starts", async () => {
    const expired = await t.createUser();
    await grant(expired, 'sprint30', '-40 days', '-10 days');
    expect(await plan(expired)).toEqual([{ plan: 'free', ends_at: null }]);

    const future = await t.createUser();
    await grant(future, 'sprint30', '1 day', '31 days');
    expect(await plan(future)).toEqual([{ plan: 'free', ends_at: null }]);
  });

  it('a signed-in user sees their own plan, never someone else’s', async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    await grant(b, 'sprint90', '-1 day', '89 days');
    expect((await t.as('authenticated', b, () => plan(b)))[0]!.plan).toBe('sprint90');
    expect((await t.as('authenticated', a, () => plan(b)))[0]!.plan).toBe('free'); // RLS hides B's rows
    expect((await t.as('service_role', null, () => plan(b)))[0]!.plan).toBe('sprint90');
    await expect(t.as('anon', null, () => plan(b))).rejects.toThrow(/permission denied/);
  });
});
