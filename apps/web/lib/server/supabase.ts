import type { AppEnv } from './env';

// Minimal service-role client over Supabase's REST API (PostgREST), server only.
// v0 needs exactly three calls (consume_quota, insert llm_calls, delete a lock row), so a few
// fetch() lines beat bundling @supabase/supabase-js into the Worker. Phase 1 (auth, RLS reads)
// will bring in @supabase/ssr.

/** Supabase must never hold up a user's request for long: on timeout we fail open (§9). */
export const SUPABASE_TIMEOUT_MS = 3_000;

export class SupabaseError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'SupabaseError';
  }
}

export interface SupabaseAdmin {
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
  insert(table: string, row: Record<string, unknown> | Record<string, unknown>[]): Promise<void>;
  /** `filters` are PostgREST equality filters, e.g. `{ subject: 'ip:…' }` → `subject=eq.ip:…`. */
  deleteWhere(table: string, filters: Record<string, string>): Promise<void>;
}

/** Null when Supabase isn't configured (callers fail open and log). */
export function supabaseAdmin(env: AppEnv, fetchImpl: typeof fetch = fetch): SupabaseAdmin | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;

  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };

  async function call(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${url}/rest/v1/${path}`, { ...init, signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS) });
    } catch (err) {
      throw new SupabaseError(`Supabase request failed: ${String(err)}`, null);
    }
    if (!res.ok) {
      // PostgREST error bodies hold codes/hints, never our secrets; cap them anyway.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new SupabaseError(`Supabase ${init.method} ${path.split('?')[0]} → ${res.status} ${detail}`, res.status);
    }
    return res;
  }

  return {
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      const res = await call(`rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
      return (await res.json()) as T;
    },
    async insert(table, row) {
      await call(table, { method: 'POST', headers: { ...headers, prefer: 'return=minimal' }, body: JSON.stringify(row) });
    },
    async deleteWhere(table, filters) {
      const qs = Object.entries(filters)
        .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`)
        .join('&');
      await call(`${table}?${qs}`, { method: 'DELETE', headers: { ...headers, prefer: 'return=minimal' } });
    },
  };
}
