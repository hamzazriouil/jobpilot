import { describe, expect, it, vi } from 'vitest';
import {
  BUDGET_GUARD_MATCH_ANALYSES,
  dailyMatchLimit,
  ensureTodayMatches,
  FREE_DAILY_MATCHES,
  FRESH_SCAN,
  freshJobs,
  llmBudgetTight,
  matchAnalysesLeft,
  matchAnalyzeLimit,
  matchRows,
  nextIngestAt,
  pickFresh,
  utcDay,
} from './matching';
import type { SupabaseAdmin } from './supabase';

const NOW = new Date('2026-10-26T08:30:00Z');

function fakeDb(over: Partial<SupabaseAdmin> = {}): SupabaseAdmin {
  return {
    rpc: vi.fn(async () => []),
    insert: vi.fn(async () => {}),
    insertReturning: vi.fn(async () => []),
    select: vi.fn(async () => []),
    update: vi.fn(async () => []),
    deleteWhere: vi.fn(async () => {}),
    ...over,
  } as SupabaseAdmin;
}

describe('matchRows', () => {
  it('ranks by similarity, best first, and caps at the limit', () => {
    const rows = matchRows(
      'u',
      [
        { job_id: 'a', similarity: 0.5 },
        { job_id: 'b', similarity: 0.9 },
        { job_id: 'c', similarity: 0.7 },
      ],
      '2026-10-26',
      2,
    );
    expect(rows).toEqual([
      { user_id: 'u', job_id: 'b', match_date: '2026-10-26', similarity: 0.9, rank: 1 },
      { user_id: 'u', job_id: 'c', match_date: '2026-10-26', similarity: 0.7, rank: 2 },
    ]);
  });
});

describe('limits', () => {
  it('free users get 5 matches, paid 30; the budget guard trims feed analyses to 3', () => {
    expect(dailyMatchLimit('free')).toBe(FREE_DAILY_MATCHES);
    expect(dailyMatchLimit('sprint_30')).toBe(30);
    expect(matchAnalyzeLimit('free', false)).toBe(5);
    expect(matchAnalyzeLimit('sprint_30', true)).toBe(BUDGET_GUARD_MATCH_ANALYSES);
  });
  it('uses UTC days', () => {
    expect(utcDay(new Date('2026-10-26T23:59:00-02:00'))).toBe('2026-10-27');
  });
});

describe('ensureTodayMatches', () => {
  it('does nothing when today already has matches', async () => {
    const db = fakeDb({ select: vi.fn(async () => [{ job_id: 'x' }]) as SupabaseAdmin['select'] });
    expect(await ensureTodayMatches(db, 'u', { limit: 5, now: NOW })).toBe(0);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('stores the top candidates for today', async () => {
    const db = fakeDb({ rpc: vi.fn(async () => [{ job_id: 'a', similarity: 0.8 }]) as SupabaseAdmin['rpc'] });
    expect(await ensureTodayMatches(db, 'u', { limit: 5, now: NOW })).toBe(1);
    expect(db.rpc).toHaveBeenCalledWith('match_jobs', { p_user: 'u', p_limit: 5 });
    expect(db.insertReturning).toHaveBeenCalledWith(
      'daily_matches',
      [{ user_id: 'u', job_id: 'a', match_date: '2026-10-26', similarity: 0.8, rank: 1 }],
      'user_id,job_id',
    );
  });
  it('skips the insert when nothing matches', async () => {
    const db = fakeDb();
    expect(await ensureTodayMatches(db, 'u', { limit: 5, now: NOW })).toBe(0);
    expect(db.insertReturning).not.toHaveBeenCalled();
  });
});

describe('budget and allowance', () => {
  it('is tight when a row exists at 80% of the budget', async () => {
    const select = vi.fn(async () => [{ id: 1 }]) as SupabaseAdmin['select'];
    expect(await llmBudgetTight(fakeDb({ select }), NOW)).toBe(true);
    expect(select).toHaveBeenCalledWith('llm_calls', expect.stringContaining('offset=800'));
    expect(await llmBudgetTight(fakeDb(), NOW)).toBe(false);
  });
  it('subtracts today’s match_analyze count', async () => {
    const select = vi.fn(async () => [{ count: 2 }]) as SupabaseAdmin['select'];
    expect(await matchAnalysesLeft(fakeDb({ select }), 'u', 5, NOW)).toBe(3);
    expect(select).toHaveBeenCalledWith('usage_counters', expect.stringContaining('feature=eq.match_analyze&day=eq.2026-10-26'));
    expect(await matchAnalysesLeft(fakeDb(), 'u', 5, NOW)).toBe(5);
  });
});

describe('new today', () => {
  it('keeps the candidates added today, best first', () => {
    const candidates = [
      { job_id: 'old', similarity: 0.8 },
      { job_id: 'b', similarity: 0.75 },
      { job_id: 'a', similarity: 0.7 },
    ];
    expect(pickFresh(candidates, new Set(['a', 'b', 'not-eligible']))).toEqual(['b', 'a']);
  });
  it('finds the next ingest run on the 6-hour UTC grid', () => {
    expect(nextIngestAt(NOW).toISOString()).toBe('2026-10-26T12:00:00.000Z');
    expect(nextIngestAt(new Date('2026-10-26T18:00:00Z')).toISOString()).toBe('2026-10-27T00:00:00.000Z');
  });
  it('counts today’s jobs and reads the latest source run', async () => {
    const select = vi.fn(async (table: string) =>
      table === 'jobs' ? [{ id: 'a' }, { id: 'b' }, { id: 'c' }] : [{ last_run_at: '2026-10-26T06:00:30Z' }],
    ) as SupabaseAdmin['select'];
    const rpc = vi.fn(async () => [{ job_id: 'z', similarity: 0.9 }, { job_id: 'c', similarity: 0.7 }]) as SupabaseAdmin['rpc'];
    expect(await freshJobs(fakeDb({ select, rpc }), 'u', NOW)).toEqual({ lastCheckedAt: '2026-10-26T06:00:30Z', newToday: 3, openIds: ['c'] });
    expect(select).toHaveBeenCalledWith('jobs', expect.stringContaining('ingested_at=gte.2026-10-26T00:00:00Z'));
    expect(rpc).toHaveBeenCalledWith('match_jobs', { p_user: 'u', p_limit: FRESH_SCAN });
  });
});
