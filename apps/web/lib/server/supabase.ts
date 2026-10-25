import type { AppEnv } from './env';

// Minimal service-role client over Supabase's REST API (PostgREST), server only. It bypasses RLS:
// use it only for server-written columns and server-only tables (usage_counters, llm_calls, …).
// Reads and writes on behalf of a signed-in user go through createSupabaseServer() (lib/supabase).

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
  /**
   * INSERT returning the stored rows. With `onConflict` (comma-separated columns) an existing row is
   * merged instead (`resolution=merge-duplicates`), so retries don't fail on unique keys.
   */
  insertReturning<T>(table: string, row: Record<string, unknown> | Record<string, unknown>[], onConflict?: string): Promise<T[]>;
  /** `query` is a raw PostgREST query string, e.g. `select=count&subject=eq.user:…`. */
  select<T>(table: string, query: string): Promise<T[]>;
  /** PATCH rows matching equality `filters`; returns the updated rows. */
  update<T>(table: string, filters: Record<string, string>, patch: Record<string, unknown>): Promise<T[]>;
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
    async insertReturning<T>(table: string, row: Record<string, unknown> | Record<string, unknown>[], onConflict?: string) {
      const path = onConflict ? `${table}?on_conflict=${encodeURIComponent(onConflict)}` : table;
      const prefer = onConflict ? 'return=representation,resolution=merge-duplicates' : 'return=representation';
      const res = await call(path, { method: 'POST', headers: { ...headers, prefer }, body: JSON.stringify(row) });
      return (await res.json()) as T[];
    },
    async select<T>(table: string, query: string) {
      const res = await call(`${table}?${query}`, { method: 'GET', headers });
      return (await res.json()) as T[];
    },
    async update<T>(table: string, filters: Record<string, string>, patch: Record<string, unknown>) {
      const res = await call(`${table}?${eqQuery(filters)}`, {
        method: 'PATCH',
        headers: { ...headers, prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      return (await res.json()) as T[];
    },
    async deleteWhere(table, filters) {
      await call(`${table}?${eqQuery(filters)}`, { method: 'DELETE', headers: { ...headers, prefer: 'return=minimal' } });
    },
  };
}

function eqQuery(filters: Record<string, string>): string {
  return Object.entries(filters)
    .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`)
    .join('&');
}
