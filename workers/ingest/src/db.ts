// Service-role PostgREST client for the ingest Worker and CLI (docs/09-PHASE1-CONTRACT.md §5).
// Same approach as apps/web/lib/server/supabase.ts: a few fetch() calls instead of supabase-js.
// Writes only `jobs` and `sources` (plus the run_maintenance RPC).

export const DB_TIMEOUT_MS = 20_000;
/** Hashes per `content_hash=in.(…)` select: 100 × 65 chars keeps the URL well under 8 KB. */
const HASH_SELECT_CHUNK = 100;

export class DbError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

/** A `jobs` row as written by ingest (snake_case = column names). */
export interface JobRow {
  source_id: string;
  source_job_id: string | null;
  owner_id: null;
  url: string | null;
  title: string;
  company: string | null;
  company_url: string | null;
  description: string;
  location_raw: string | null;
  eligibility_type: 'worldwide' | 'regions' | 'unclear';
  allowed_regions: string[];
  eligibility_quote: string | null;
  seniority: string | null;
  salary_min_usd: number | null;
  salary_max_usd: number | null;
  tags: string[];
  content_hash: string;
  /** pgvector text literal "[0.1,0.2,…]" */
  embedding: string;
  posted_at: string | null;
  expires_at: string | null;
}

export interface SourceRow {
  id: string;
  enabled: boolean;
  last_run_at: string | null;
}

export interface IngestDb {
  /** Which of `hashes` already exist among public jobs. */
  existingHashes(hashes: string[]): Promise<Set<string>>;
  /** Upsert on (source_id, source_job_id). Returns how many rows were written. */
  upsertJobs(rows: JobRow[]): Promise<number>;
  enabledSources(): Promise<SourceRow[]>;
  updateSource(id: string, patch: Record<string, unknown>): Promise<void>;
  runMaintenance(): Promise<unknown>;
  /** Exact count of public jobs matching PostgREST `filters` (e.g. `eligibility_type=eq.worldwide`). */
  countPublicJobs(filters?: string): Promise<number>;
  /** Up to `max` ISO-2 countries of onboarded users, most users first. */
  userCountries(max: number): Promise<string[]>;
  /** Public jobs of a source not marked expired yet, oldest first (for status syncs). */
  liveSourceJobs(sourceId: string, max: number): Promise<Array<{ id: string; source_job_id: string }>>;
  /** Marks public jobs expired now (they leave matching and the feed). Returns how many ids were sent. */
  expireJobs(ids: string[]): Promise<number>;
}

/** Country codes → distinct codes, most frequent first (ties: alphabetical), at most `max`. */
export function topCountries(codes: Array<string | null>, max: number): string[] {
  const counts = new Map<string, number>();
  for (const c of codes) if (c && /^[A-Z]{2}$/.test(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([c]) => c);
}

export function createDb(cfg: { url: string; serviceRoleKey: string; fetch?: typeof fetch }): IngestDb {
  const base = `${cfg.url.trim().replace(/\/+$/, '')}/rest/v1`;
  const fetchImpl = cfg.fetch ?? fetch;
  const headers = {
    apikey: cfg.serviceRoleKey,
    authorization: `Bearer ${cfg.serviceRoleKey}`,
    'content-type': 'application/json',
  };

  async function call(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
    const { prefer, ...rest } = init;
    let res: Response;
    try {
      res = await fetchImpl(`${base}/${path}`, {
        ...rest,
        headers: { ...headers, ...(prefer ? { prefer } : {}) },
        signal: AbortSignal.timeout(DB_TIMEOUT_MS),
      });
    } catch (err) {
      throw new DbError(`Supabase request failed: ${String(err)}`, null);
    }
    if (!res.ok) {
      // PostgREST error bodies hold codes/hints, never our key; cap them anyway.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new DbError(`Supabase ${rest.method ?? 'GET'} ${path.split('?')[0]} → ${res.status} ${detail}`, res.status);
    }
    return res;
  }

  return {
    async existingHashes(hashes) {
      const found = new Set<string>();
      for (let i = 0; i < hashes.length; i += HASH_SELECT_CHUNK) {
        const chunk = hashes.slice(i, i + HASH_SELECT_CHUNK);
        if (!chunk.length) continue;
        // Hex hashes need no quoting inside in.(…).
        const res = await call(`jobs?select=content_hash&owner_id=is.null&content_hash=in.(${chunk.join(',')})`);
        for (const r of (await res.json()) as Array<{ content_hash: string }>) found.add(r.content_hash);
      }
      return found;
    },

    async upsertJobs(rows) {
      if (!rows.length) return 0;
      await call('jobs?on_conflict=source_id,source_job_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify(rows),
      });
      return rows.length;
    },

    async enabledSources() {
      const res = await call('sources?select=id,enabled,last_run_at&enabled=is.true&kind=neq.user');
      return (await res.json()) as SourceRow[];
    },

    async updateSource(id, patch) {
      await call(`sources?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify(patch),
      });
    },

    async runMaintenance() {
      const res = await call('rpc/run_maintenance', { method: 'POST', body: '{}' });
      return res.json();
    },

    async userCountries(max) {
      const res = await call('profiles?select=country_code&onboarded_at=not.is.null&limit=5000');
      return topCountries(((await res.json()) as Array<{ country_code: string | null }>).map((r) => r.country_code), max);
    },

    async liveSourceJobs(sourceId, max) {
      const res = await call(
        `jobs?select=id,source_job_id&owner_id=is.null&source_id=eq.${encodeURIComponent(sourceId)}&expires_at=is.null&source_job_id=not.is.null&order=ingested_at.asc&limit=${max}`,
      );
      return (await res.json()) as Array<{ id: string; source_job_id: string }>;
    },

    async expireJobs(ids) {
      if (!ids.length) return 0;
      // UUIDs need no quoting inside in.(…).
      await call(`jobs?owner_id=is.null&id=in.(${ids.join(',')})`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: JSON.stringify({ expires_at: new Date().toISOString() }),
      });
      return ids.length;
    },

    async countPublicJobs(filters = '') {
      const res = await call(`jobs?select=id&owner_id=is.null${filters ? `&${filters}` : ''}`, {
        method: 'HEAD',
        prefer: 'count=exact',
      });
      // Content-Range: 0-24/312  or  */0
      const total = res.headers.get('content-range')?.split('/')[1];
      const n = Number(total);
      if (!Number.isFinite(n)) throw new DbError('Supabase count: no Content-Range total', res.status);
      return n;
    },
  };
}

/** pgvector text literal; 6 decimals is plenty for cosine similarity and halves the payload. */
export function toVectorLiteral(v: readonly number[]): string {
  return `[${v.map((x) => Number(x.toFixed(6))).join(',')}]`;
}
