import { describe, expect, it } from 'vitest';
import { acquireGate, lockFeature, LOCK_WINDOW_MS } from './quota';
import type { SupabaseAdmin } from './supabase';

/** In-memory stand-in for consume_quota + usage_counters. */
function fakeDb(opts: { fail?: boolean } = {}) {
  const counters = new Map<string, number>();
  const pending: Promise<unknown>[] = [];
  const db: SupabaseAdmin = {
    async rpc<T>(_fn: string, args: Record<string, unknown>) {
      if (opts.fail) throw new Error('connection refused');
      const key = `${String(args.p_subject)}|${String(args.p_feature)}`;
      const count = counters.get(key) ?? 0;
      if (count >= Number(args.p_limit)) return false as T;
      counters.set(key, count + 1);
      return true as T;
    },
    async insert() {},
    async insertReturning() {
      return [];
    },
    async select() {
      return [];
    },
    async update() {
      return [];
    },
    async deleteWhere(_table, f) {
      counters.delete(`${f.subject}|${f.feature}`);
    },
  };
  return { db, counters, waitUntil: (p: Promise<unknown>) => void pending.push(p), flush: () => Promise.all(pending) };
}

const NOW = 1_800_000_000_000;
const base = { subject: 'ip:abc', endpoint: 'analyze', quota: { feature: 'analyze', limit: 3 } };

describe('acquireGate', () => {
  it('allows 3 sequential analyses a day, then refuses with quota_exceeded', async () => {
    const f = fakeDb();
    const outcomes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const g = await acquireGate({ ...base, db: f.db, waitUntil: f.waitUntil, now: NOW + i * 1000 });
      outcomes.push(g.outcome);
      g.release();
      await f.flush();
    }
    expect(outcomes).toEqual(['allowed', 'allowed', 'allowed', 'quota_exceeded']);
    expect(f.counters.get('ip:abc|analyze')).toBe(3);
    expect([...f.counters.keys()].some((k) => k.includes('lock:'))).toBe(false); // locks released
  });

  it('refuses a concurrent request in the same window without consuming quota', async () => {
    const f = fakeDb();
    const first = await acquireGate({ ...base, db: f.db, waitUntil: f.waitUntil, now: NOW });
    const second = await acquireGate({ ...base, db: f.db, waitUntil: f.waitUntil, now: NOW + 500 });
    expect([first.outcome, second.outcome]).toEqual(['allowed', 'locked']);
    expect(f.counters.get('ip:abc|analyze')).toBe(1);
  });

  it('lets a request through once the lock window has passed, even if a lock row was left behind', async () => {
    const f = fakeDb();
    await acquireGate({ ...base, db: f.db, waitUntil: f.waitUntil, now: NOW }); // never released
    const later = await acquireGate({ ...base, db: f.db, waitUntil: f.waitUntil, now: NOW + LOCK_WINDOW_MS });
    expect(later.outcome).toBe('allowed');
  });

  it('fails open when Supabase errors or is not configured', async () => {
    const f = fakeDb({ fail: true });
    expect((await acquireGate({ ...base, db: f.db, waitUntil: f.waitUntil, now: NOW })).outcome).toBe('unavailable');
    expect((await acquireGate({ ...base, db: null, waitUntil: f.waitUntil, now: NOW })).outcome).toBe('unavailable');
    expect((await acquireGate({ ...base, subject: null, db: fakeDb().db, waitUntil: f.waitUntil })).outcome).toBe('unavailable');
  });

  it('lock-only endpoints never touch the daily quota', async () => {
    const f = fakeDb();
    const g = await acquireGate({ ...base, endpoint: 'draft', quota: null, db: f.db, waitUntil: f.waitUntil, now: NOW });
    expect(g.outcome).toBe('allowed');
    expect([...f.counters.keys()]).toEqual([`ip:abc|${lockFeature('draft', NOW)}`]);
  });
});
