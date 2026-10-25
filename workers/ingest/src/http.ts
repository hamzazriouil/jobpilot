// Polite HTTP for job sources (docs/09-PHASE1-CONTRACT.md §5, docs/10-SOURCES.md):
// our User-Agent on every request, at most one request per `minIntervalMs` per source,
// a timeout, and one retry on 429/503 that honors Retry-After (capped).

export const SOURCE_TIMEOUT_MS = 20_000;
const MAX_RETRY_AFTER_MS = 30_000;

export interface PoliteFetchOptions {
  userAgent: string;
  fetch?: typeof fetch;
  /** Minimum gap between two requests to this source. Default 1000 ms (≤ 1 req/s). */
  minIntervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class SourceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'SourceHttpError';
  }
}

export type GetJson = (url: string, headers?: Record<string, string>) => Promise<unknown>;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(res: Response): number {
  const h = res.headers.get('retry-after');
  const secs = h ? Number(h) : NaN;
  return Math.min(Number.isFinite(secs) ? secs * 1000 : 5_000, MAX_RETRY_AFTER_MS);
}

/** One instance per source: the rate limit is per instance. */
export function createGetJson(opts: PoliteFetchOptions): GetJson {
  const fetchImpl = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const gap = opts.minIntervalMs ?? 1_000;
  let last = -Infinity;

  async function once(url: string, headers: Record<string, string>): Promise<Response> {
    const wait = last + gap - now();
    if (wait > 0) await sleep(wait);
    last = now();
    try {
      return await fetchImpl(url, {
        headers: { 'user-agent': opts.userAgent, accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? SOURCE_TIMEOUT_MS),
      });
    } catch (err) {
      throw new SourceHttpError(`GET ${new URL(url).host} failed: ${String(err)}`, null);
    }
  }

  return async (url, headers = {}) => {
    let res = await once(url, headers);
    if (res.status === 429 || res.status === 503) {
      await sleep(retryAfterMs(res));
      res = await once(url, headers);
    }
    if (!res.ok) {
      throw new SourceHttpError(`GET ${new URL(url).host}${new URL(url).pathname} → ${res.status}`, res.status);
    }
    try {
      return await res.json();
    } catch {
      throw new SourceHttpError(`GET ${new URL(url).host}: invalid JSON`, res.status);
    }
  };
}
