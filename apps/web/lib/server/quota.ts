import type { SupabaseAdmin } from './supabase';

// Anonymous quota + burst lock (docs/05-ARCHITECTURE.md §9), both on `consume_quota` / `usage_counters`.
//
// Quota: consume_quota(subject, 'analyze', 3) per UTC day. Drafting is included in the analysis (§5.2)
// and is not counted in v0.
//
// Burst lock ("at most 1 request in flight per subject, 10-second lock in usage_counters"): the
// migration has no lock function and usage_counters has no timestamp, so the lock is a
// consume_quota(subject, 'lock:<endpoint>:<10s bucket>', 1) row. A second request in the same
// 10-second window is refused while the first one runs; the row is deleted when the request ends,
// so back-to-back requests are fine, and a row left behind by a crashed request stops mattering
// once the window passes (the daily maintenance job removes old usage_counters rows).
//
// Fail open: if Supabase is down or not configured, log a structured error and let the request
// through. The Cloudflare WAF rate-limit rule on /api/* is the backstop.

export const ANON_ANALYZE_DAILY_LIMIT = 3;
/** Signed-in limits (§9). Paid plans arrive in Phase 2. */
export const USER_ANALYZE_DAILY_LIMIT = 5;
export const PAID_ANALYZE_DAILY_LIMIT = 30;
/** Draft rewrites of a saved analysis per signed-in free user per day (§9 "draft regenerate"). */
export const USER_DRAFT_REDO_DAILY_LIMIT = 3;
/** Follow-up messages per signed-in user per day (W16; plan-based limits come with W19). */
export const USER_FOLLOW_UP_DAILY_LIMIT = 3;
/** CV parses per signed-in free user per day (§9). */
export const USER_PARSE_DAILY_LIMIT = 5;
/** Magic-link emails per anonymous subject per day (protects the SMTP quota). */
export const MAGIC_LINK_DAILY_LIMIT = 5;

export function userSubject(userId: string): string {
  return `user:${userId}`;
}
export const LOCK_WINDOW_MS = 10_000;

export type GateOutcome = 'allowed' | 'locked' | 'quota_exceeded' | 'unavailable';

export interface Gate {
  outcome: GateOutcome;
  /** Releases the burst lock (fire-and-forget; safe to call more than once). */
  release(): void;
}

export interface GateOptions {
  db: SupabaseAdmin | null;
  /** `ip:<sha256>` or null when the subject can't be computed (fail open). */
  subject: string | null;
  /** Endpoint name for the lock row: 'analyze' | 'draft'. */
  endpoint: string;
  /** Daily quota to consume, or null for lock-only endpoints. */
  quota: { feature: string; limit: number } | null;
  waitUntil(p: Promise<unknown>): void;
  now?: number;
}

export function lockFeature(endpoint: string, now: number): string {
  return `lock:${endpoint}:${Math.floor(now / LOCK_WINDOW_MS)}`;
}

const NOOP_RELEASE = () => {};

export async function acquireGate(o: GateOptions): Promise<Gate> {
  if (!o.db || !o.subject) {
    console.error(
      JSON.stringify({ type: 'quota_unavailable', reason: !o.db ? 'supabase_not_configured' : 'no_subject', endpoint: o.endpoint }),
    );
    return { outcome: 'unavailable', release: NOOP_RELEASE };
  }
  const { db, subject } = o;
  const feature = lockFeature(o.endpoint, o.now ?? Date.now());

  let locked = false;
  let released = false;
  const release = () => {
    if (!locked || released) return;
    released = true;
    o.waitUntil(
      db.deleteWhere('usage_counters', { subject, feature }).catch((err: unknown) => {
        console.error(JSON.stringify({ type: 'lock_release_failed', endpoint: o.endpoint, message: String(err) }));
      }),
    );
  };

  try {
    const gotLock = await db.rpc<boolean>('consume_quota', { p_subject: subject, p_feature: feature, p_limit: 1 });
    if (gotLock !== true) return { outcome: 'locked', release: NOOP_RELEASE };
    locked = true;

    if (o.quota) {
      const allowed = await db.rpc<boolean>('consume_quota', {
        p_subject: subject,
        p_feature: o.quota.feature,
        p_limit: o.quota.limit,
      });
      if (allowed !== true) {
        release();
        return { outcome: 'quota_exceeded', release: NOOP_RELEASE };
      }
    }
    return { outcome: 'allowed', release };
  } catch (err) {
    console.error(JSON.stringify({ type: 'quota_unavailable', reason: 'supabase_error', endpoint: o.endpoint, message: String(err) }));
    release();
    return { outcome: 'unavailable', release: NOOP_RELEASE };
  }
}
