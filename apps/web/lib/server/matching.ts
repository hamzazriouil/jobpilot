import type { SupabaseClient } from '@supabase/supabase-js';
import { userSubject } from './quota';
import type { SupabaseAdmin } from './supabase';

// Daily matches (docs/05-ARCHITECTURE.md §5.5, W14), built lazily instead of by a 06:00 cron:
// the first /feed visit of a UTC day calls ensureTodayMatches(), which takes the user's top
// candidates from match_jobs (pgvector similarity + eligibility + not seen before) and stores them
// in daily_matches. A new user's first feed visit right after onboarding is the "instant first
// matches". "Users active in the last 14 days" are exactly the users who open the feed, so no
// cron is needed until digest emails exist.
//
// Matched jobs are analyzed from the feed (no drafts) on a separate 'match_analyze' counter, so they
// don't use the user's own 5 analyses a day. Budget guard: when the day's LLM calls pass 80% of
// LLM_DAILY_CALL_BUDGET, only BUDGET_GUARD_MATCH_ANALYSES matches per user are analyzed for free and
// the rest are analyzed on demand from the normal quota.

export const FREE_DAILY_MATCHES = 5;
export const PAID_DAILY_MATCHES = 30;
/** All LLM calls in a UTC day, all users and tasks: a guess at the free provider allowance. */
export const LLM_DAILY_CALL_BUDGET = 1000;
export const BUDGET_GUARD_RATIO = 0.8;
export const BUDGET_GUARD_MATCH_ANALYSES = 3;
/** The feed shows today and the previous days up to this many days back. */
export const FEED_HISTORY_DAYS = 14;

export const MATCH_ANALYZE_FEATURE = 'match_analyze';

/** YYYY-MM-DD in UTC (match_date and usage_counters.day are UTC days). */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function dailyMatchLimit(plan: string): number {
  return plan === 'free' ? FREE_DAILY_MATCHES : PAID_DAILY_MATCHES;
}

/** The user's plan from current_plan(); 'free' when it can't be read. */
export async function loadPlan(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('current_plan', { p_user: userId });
  if (error) return 'free';
  return (data as Array<{ plan: string }> | null)?.[0]?.plan ?? 'free';
}

export interface MatchCandidate {
  job_id: string;
  similarity: number;
}

/** daily_matches rows for today's candidates, best first (rank 1 = most similar). */
export function matchRows(userId: string, candidates: MatchCandidate[], day: string, limit: number) {
  return [...candidates]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((c, i) => ({ user_id: userId, job_id: c.job_id, match_date: day, similarity: c.similarity, rank: i + 1 }));
}

/**
 * Builds today's matches once per user and day. Returns how many rows were added (0 when today's
 * matches already exist, the profile has no embedding, or nothing new matches).
 */
export async function ensureTodayMatches(db: SupabaseAdmin, userId: string, o: { limit: number; now?: Date }): Promise<number> {
  const day = utcDay(o.now);
  const uid = encodeURIComponent(userId);
  const existing = await db.select<{ job_id: string }>('daily_matches', `select=job_id&user_id=eq.${uid}&match_date=eq.${day}&limit=1`);
  if (existing.length > 0) return 0;
  const candidates = await db.rpc<MatchCandidate[]>('match_jobs', { p_user: userId, p_limit: o.limit });
  const rows = matchRows(userId, candidates ?? [], day, o.limit);
  if (rows.length === 0) return 0;
  // Two tabs opening the feed at once insert the same rows; merging makes that harmless.
  await db.insertReturning('daily_matches', rows, 'user_id,job_id');
  return rows.length;
}

/** True once today's LLM calls (all users) pass BUDGET_GUARD_RATIO of the daily budget. */
export async function llmBudgetTight(db: SupabaseAdmin, now: Date = new Date()): Promise<boolean> {
  const offset = Math.floor(LLM_DAILY_CALL_BUDGET * BUDGET_GUARD_RATIO);
  // No count header in the admin client: "is there a row at position N today?" answers the same.
  const rows = await db.select<{ id: number }>('llm_calls', `select=id&created_at=gte.${utcDay(now)}T00:00:00Z&order=id.asc&limit=1&offset=${offset}`);
  return rows.length > 0;
}

/** Free feed analyses per day for this user: the daily matches, or fewer under the budget guard. */
export function matchAnalyzeLimit(plan: string, budgetTight: boolean): number {
  const limit = dailyMatchLimit(plan);
  return budgetTight ? Math.min(limit, BUDGET_GUARD_MATCH_ANALYSES) : limit;
}

/** How many free feed analyses the user has left today (0 on any error: the feed then asks first). */
export async function matchAnalysesLeft(db: SupabaseAdmin, userId: string, limit: number, now: Date = new Date()): Promise<number> {
  const subject = encodeURIComponent(userSubject(userId));
  const [row] = await db.select<{ count: number }>(
    'usage_counters',
    `select=count&subject=eq.${subject}&feature=eq.${MATCH_ANALYZE_FEATURE}&day=eq.${utcDay(now)}`,
  );
  return Math.max(0, limit - (row?.count ?? 0));
}
