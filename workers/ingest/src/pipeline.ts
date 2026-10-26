import { embedTexts, jobEmbeddingText, type EmbedDeps } from '@jobpilot/core/embed';
import { classifyLocationRules, isTechRole, jobContentHash, type LocationVerdict } from '@jobpilot/core/jobs';
import { LlmError, type LlmCallSink, type ProviderConfig } from '@jobpilot/core/llm';
import type { JobInput } from '@jobpilot/core/schemas';
import { toVectorLiteral, type IngestDb, type JobRow } from './db';
import { createGetJson } from './http';
import { classifyLocationLLM } from './location-llm';
import { errorText, type LogFn } from './log';
import type { SourceAdapter } from './sources';

// The ingest pipeline (docs/05-ARCHITECTURE.md §5.4, docs/09-PHASE1-CONTRACT.md §5), one page at a time:
//   fetch → normalize (adapter) → isTechRole → content hash → skip hashes already among public jobs
//   → location rules → LLM fallback for 'unclear' (capped) → embed → upsert jobs
// then sources.last_run_at / last_status. Shared by the Worker (cron) and the CLI (local, REST).

export interface PipelineDeps {
  /** null = no DB access at all (dry run without credentials: nothing is deduped). */
  db: IngestDb | null;
  /** null = no embeddings (dry run). A real run without it is refused. */
  embed: EmbedDeps | null;
  /** null = no LLM fallback ('unclear' stays 'unclear'). */
  llm: ProviderConfig | null;
  llmSink?: LlmCallSink;
  fetch?: typeof fetch;
  userAgent: string;
  log: LogFn;
  /** Per-source API keys (e.g. himalayas). */
  apiKeys?: Record<string, string | undefined>;
  /** ISO-2 countries our users live in, most users first (for sources that search by country). */
  countries?: string[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export interface RunOptions {
  dryRun: boolean;
  /** Max requests per source. */
  maxPages: number;
  /** Max new tech jobs written (or, in a dry run, counted) per source. */
  limit?: number;
  /** Max LLM fallback calls per run, across sources. */
  llmCap: number;
  /** Stop paging after this many pages in a row where every tech job was already known. Default 2. */
  stopAfterKnownPages?: number;
}

export interface SourceStats {
  source: string;
  ok: boolean;
  error?: string;
  pages: number;
  fetched: number;
  invalid: number;
  tech: number;
  duplicates: number;
  fresh: number;
  eligibility: Record<LocationVerdict['eligibilityType'], number>;
  llmTried: number;
  llmResolved: number;
  embedded: number;
  upserted: number;
  failedRows: number;
  /** First few new jobs, as normalized (dry-run output). */
  samples: Array<JobInput & { contentHash: string }>;
}

interface LlmBudget {
  remaining: number;
  disabled: boolean;
}

const UPSERT_CHUNK = 25; // 25 × ~8 KB vectors per request

function emptyStats(source: string): SourceStats {
  return {
    source, ok: true, pages: 0, fetched: 0, invalid: 0, tech: 0, duplicates: 0, fresh: 0,
    eligibility: { worldwide: 0, regions: 0, unclear: 0 }, llmTried: 0, llmResolved: 0, embedded: 0,
    upserted: 0, failedRows: 0, samples: [],
  };
}

type Prepared = JobInput & { contentHash: string; eligibilityType: LocationVerdict['eligibilityType'] };

function toRow(job: Prepared, vector: number[]): JobRow {
  return {
    source_id: job.sourceId,
    source_job_id: job.sourceJobId,
    owner_id: null,
    url: job.url,
    title: job.title,
    company: job.company,
    company_url: job.companyUrl,
    description: job.description,
    location_raw: job.locationRaw,
    eligibility_type: job.eligibilityType,
    allowed_regions: job.allowedRegions,
    eligibility_quote: job.eligibilityQuote,
    seniority: job.seniority,
    salary_min_usd: job.salaryMinUsd,
    salary_max_usd: job.salaryMaxUsd,
    tags: job.tags,
    content_hash: job.contentHash,
    embedding: toVectorLiteral(vector),
    posted_at: job.postedAt,
    expires_at: job.expiresAt,
  };
}

async function classify(
  job: JobInput,
  deps: PipelineDeps,
  opts: RunOptions,
  budget: LlmBudget,
  stats: SourceStats,
): Promise<Pick<Prepared, 'eligibilityType' | 'allowedRegions' | 'eligibilityQuote'>> {
  // Adapters with structured location data (Himalayas) arrive classified.
  let verdict: LocationVerdict =
    job.eligibilityType !== null
      ? { eligibilityType: job.eligibilityType, allowedRegions: job.allowedRegions, quote: job.eligibilityQuote }
      : classifyLocationRules({ locationRaw: job.locationRaw, description: `${job.title}\n${job.description}` });

  if (verdict.eligibilityType === 'unclear' && !opts.dryRun && deps.llm && !budget.disabled && budget.remaining > 0) {
    budget.remaining--;
    stats.llmTried++;
    try {
      const llmVerdict = await classifyLocationLLM(job, { providers: deps.llm, sink: deps.llmSink });
      if (llmVerdict.eligibilityType !== 'unclear') {
        verdict = llmVerdict;
        stats.llmResolved++;
      }
    } catch (err) {
      // Rate-limited or misconfigured: stop asking for the rest of the run, keep 'unclear'.
      if (err instanceof LlmError && (err.code === 'busy' || err.code === 'bad_config' || err.code === 'timeout')) budget.disabled = true;
      deps.log('llm_fallback_error', { source: job.sourceId, error: errorText(err) });
    }
  }
  return { eligibilityType: verdict.eligibilityType, allowedRegions: verdict.allowedRegions, eligibilityQuote: verdict.quote };
}

async function writeRows(rows: JobRow[], db: IngestDb, stats: SourceStats, log: LogFn): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    try {
      stats.upserted += await db.upsertJobs(chunk);
    } catch (err) {
      // One bad row (e.g. a hash written by another source a moment ago → 409) must not sink the
      // chunk: retry row by row and count the failures.
      log('upsert_chunk_error', { source: stats.source, rows: chunk.length, error: errorText(err) });
      for (const row of chunk) {
        try {
          stats.upserted += await db.upsertJobs([row]);
        } catch (rowErr) {
          stats.failedRows++;
          log('upsert_row_error', { source: stats.source, sourceJobId: row.source_job_id, error: errorText(rowErr) });
        }
      }
    }
  }
}

/** Runs one source end to end. Never throws: failures land in the returned stats. */
export async function runSource(
  adapter: SourceAdapter,
  deps: PipelineDeps,
  opts: RunOptions,
  budget: LlmBudget = { remaining: opts.llmCap, disabled: false },
): Promise<SourceStats> {
  const stats = emptyStats(adapter.id);
  const log = deps.log;
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  const stopAfter = opts.stopAfterKnownPages ?? 2;
  const seen = new Set<string>();
  let knownPagesInARow = 0;
  const caughtUp = new Set<string>();
  let stream: string | undefined;

  if (!opts.dryRun && (!deps.db || !deps.embed)) {
    stats.ok = false;
    stats.error = 'a real run needs a DB and embeddings';
    return stats;
  }

  const getJson = createGetJson({ userAgent: deps.userAgent, fetch: deps.fetch, minIntervalMs: adapter.minIntervalMs, sleep: deps.sleep });

  try {
    const pages = adapter.pages({
      getJson,
      maxPages: opts.maxPages,
      apiKey: deps.apiKeys?.[adapter.id],
      log,
      countries: deps.countries,
      isCaughtUp: (s) => caughtUp.has(s),
    });
    for await (const page of pages) {
      stats.pages++;
      if (page.stream !== stream) {
        stream = page.stream;
        knownPagesInARow = 0;
      }
      stats.fetched += page.fetched;
      stats.invalid += page.invalid;

      const tech = page.jobs.filter((j) => isTechRole({ title: j.title, tags: j.tags }));
      stats.tech += tech.length;

      // Hash, then drop repeats inside this run and jobs already in the DB.
      const hashed = await Promise.all(
        tech.map(async (j) => ({ ...j, contentHash: await jobContentHash({ company: j.company, title: j.title, description: j.description }) })),
      );
      const unseen = hashed.filter((j) => {
        if (seen.has(j.contentHash)) return false;
        seen.add(j.contentHash);
        return true;
      });
      const existing = deps.db ? await deps.db.existingHashes(unseen.map((j) => j.contentHash)) : new Set<string>();
      let fresh = unseen.filter((j) => !existing.has(j.contentHash));
      stats.duplicates += tech.length - fresh.length;

      knownPagesInARow = tech.length > 0 && fresh.length === 0 ? knownPagesInARow + 1 : 0;

      const room = limit - stats.fresh;
      if (fresh.length > room) fresh = fresh.slice(0, Math.max(0, room));
      stats.fresh += fresh.length;

      const prepared: Prepared[] = [];
      for (const j of fresh) {
        const verdict = await classify(j, deps, opts, budget, stats);
        prepared.push({ ...j, ...verdict });
        stats.eligibility[verdict.eligibilityType]++;
      }
      for (const p of prepared) if (stats.samples.length < 3) stats.samples.push(p);

      if (!opts.dryRun && prepared.length) {
        const vectors = await embedTexts(prepared.map((p) => jobEmbeddingText(p)), deps.embed!);
        stats.embedded += vectors.length;
        await writeRows(prepared.map((p, i) => toRow(p, vectors[i]!)), deps.db!, stats, log);
      }

      log('page', {
        source: adapter.id, page: stats.pages, fetched: page.fetched, tech: tech.length, fresh: fresh.length,
        upserted: stats.upserted,
      });
      if (stats.fresh >= limit) break;
      if (knownPagesInARow >= stopAfter) {
        log('caught_up', { source: adapter.id, page: stats.pages, stream: page.stream });
        if (page.stream === undefined) break;
        caughtUp.add(page.stream);
      }
    }
  } catch (err) {
    stats.ok = false;
    stats.error = errorText(err);
    log('source_error', { source: adapter.id, error: stats.error });
  }

  if (!opts.dryRun && deps.db) {
    const now = (deps.now ?? (() => new Date()))();
    const summary = `fetched ${stats.fetched}, tech ${stats.tech}, new ${stats.fresh}, upserted ${stats.upserted}`;
    const lastStatus = stats.ok ? `ok: ${summary}` : `error: ${stats.error} (${summary})`;
    try {
      await deps.db.updateSource(adapter.id, { last_run_at: now.toISOString(), last_status: lastStatus.slice(0, 500) });
    } catch (err) {
      log('source_status_error', { source: adapter.id, error: errorText(err) });
    }
  }

  const { samples: _samples, ...summary } = stats;
  log('source_done', summary);
  return stats;
}

/** Runs several sources in sequence with one shared LLM budget. */
export async function runIngest(adapters: SourceAdapter[], deps: PipelineDeps, opts: RunOptions): Promise<SourceStats[]> {
  const budget: LlmBudget = { remaining: opts.llmCap, disabled: false };
  const out: SourceStats[] = [];
  for (const a of adapters) out.push(await runSource(a, deps, opts, budget));
  return out;
}
