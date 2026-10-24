/**
 * Eval runner (docs/05-ARCHITECTURE.md §13).
 *
 *   pnpm eval --provider gemini|workers|claude [--prompt v1|v2] [--cases 001,004] [--include-raw] [--no-db] [--delay-ms 4000]
 *
 * --prompt picks the analyze prompt version (default: DEFAULT_ANALYZE_PROMPT in @jobpilot/core/prompts;
 * the ANALYZE_PROMPT_VERSION shell variable works too). The version string goes into llm_calls,
 * each AnalysisResult, the results file and eval_runs.prompt_version.
 *
 * For each case, sequentially: analyze, then draft, through the SAME pipeline as /api/analyze and
 * /api/draft (@jobpilot/core/pipeline + runLLM in stream mode). Only the chosen provider is
 * configured, so there is no cross-provider fallback; Gemini keeps its model fallback chain and
 * every call records the model that actually served it.
 *
 * Keys come from apps/web/.dev.vars (parsed here, never printed). Workers AI runs in REST mode
 * (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN).
 *
 * Output: a table on stdout, evals/results/<timestamp>-<provider>.json (synthetic cases; committed),
 * evals/results/raw-<timestamp>-<provider>.json (founder's raw cases; gitignored), and one row in
 * `eval_runs` (service role) unless --no-db.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_MODELS, LlmError, runLLM, type LlmCallRow, type LlmCallSink, type ProviderKey } from '@jobpilot/core/llm';
import {
  analyzeCall,
  buildProviderConfig,
  draftCall,
  finishAnalysis,
  finishDrafts,
  forceProvider,
  type ProviderEnv,
} from '@jobpilot/core/pipeline';
import { ANALYZE_PROMPTS, DRAFT_PROMPT_VERSION, resolveAnalyzePromptId } from '@jobpilot/core/prompts';
import type { AnalysisResult } from '@jobpilot/core/schemas';
import { supabaseAdmin } from '../apps/web/lib/server/supabase';
import { datasetVersion, loadCases, type EvalCase } from './lib/cases';
import { loadDevVars } from './lib/dev-vars';
import {
  computeMetrics,
  findCanaries,
  injectionInflationResisted,
  injectionLabelKept,
  isInjectionCase,
  mentionsHiddenInstructions,
  type AnalyzeRecord,
  type AttemptRow,
  type CaseRecord,
  type DraftRecord,
  type RunMetrics,
} from './lib/metrics';
import { DATASET_DIR, DEV_VARS_PATH, RAW_CASES_DIR, RESULTS_DIR } from './lib/paths';
import { printCaseTable, printMetrics } from './lib/report';

const PROVIDERS: readonly ProviderKey[] = ['gemini', 'workers', 'claude'];

function parseCli() {
  const { values } = parseArgs({
    options: {
      provider: { type: 'string' },
      cases: { type: 'string' },
      'include-raw': { type: 'boolean', default: false },
      'no-db': { type: 'boolean', default: false },
      'delay-ms': { type: 'string', default: '4000' },
      prompt: { type: 'string' },
    },
    allowPositionals: false,
  });
  // --prompt v1|v2 (or "analyze.v2"); else ANALYZE_PROMPT_VERSION from the shell; else the default.
  const promptId = resolveAnalyzePromptId(values.prompt ?? process.env.ANALYZE_PROMPT_VERSION);
  const provider = values.provider as ProviderKey | undefined;
  if (!provider || !PROVIDERS.includes(provider)) {
    throw new Error(`--provider must be one of ${PROVIDERS.join(', ')}`);
  }
  const delayMs = Number(values['delay-ms']);
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new Error('--delay-ms must be a non-negative number');
  const caseFilter = values.cases
    ? new Set(values.cases.split(',').map((s) => s.trim()).filter(Boolean))
    : null;
  return { provider, caseFilter, includeRaw: values['include-raw'], noDb: values['no-db'], delayMs, promptId };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function captureSink(rows: AttemptRow[]): LlmCallSink {
  return {
    record(row: LlmCallRow) {
      rows.push({
        model: row.model,
        latency_ms: row.latency_ms,
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
        cost_usd: row.cost_usd,
        schema_valid: row.schema_valid,
        retries: row.retries,
        error_code: row.error_code,
      });
    },
  };
}

function describeError(err: unknown): { errorCode: string; errorMessage: string } {
  if (err instanceof LlmError) return { errorCode: err.code, errorMessage: err.message.slice(0, 300) };
  if (err instanceof Error && err.name === 'ZodError') return { errorCode: 'normalize_failed', errorMessage: err.message.slice(0, 300) };
  return { errorCode: 'unexpected', errorMessage: String(err).slice(0, 300) };
}

/** Case ids match "001" or the full id ("001-strong-worldwide"); raw cases also match "raw-001". */
function matches(c: EvalCase, filter: Set<string> | null): boolean {
  if (!filter) return true;
  const num = c.id.match(/\d{3}/)?.[0];
  return filter.has(c.id) || (num !== undefined && filter.has(c.raw ? `raw-${num}` : num));
}

async function main(): Promise<void> {
  const args = parseCli();
  const env = loadDevVars(DEV_VARS_PATH);
  // Same env → config code as the API routes; isProd=false so Workers AI uses REST. (No `AI`
  // binding outside a Worker: .dev.vars only holds strings.)
  const providerEnv: Omit<ProviderEnv, 'AI'> = env;
  const route = forceProvider(buildProviderConfig(providerEnv, false), args.provider);
  if (!route) {
    const need = { gemini: 'GOOGLE_GENERATIVE_AI_API_KEY', workers: 'CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN', claude: 'ANTHROPIC_API_KEY' };
    throw new Error(`Provider ${args.provider} is not configured: set ${need[args.provider]} in apps/web/.dev.vars`);
  }

  const all = [...loadCases(DATASET_DIR, false), ...(args.includeRaw ? loadCases(RAW_CASES_DIR, true) : [])];
  const cases = all.filter((c) => matches(c, args.caseFilter));
  if (cases.length === 0) throw new Error('No cases selected.');
  const dsVersion = datasetVersion(cases);
  const startedAt = new Date();
  const analyzeVersion = ANALYZE_PROMPTS[args.promptId].version;
  console.log(
    `Eval: provider=${args.provider} cases=${cases.length} (${cases.filter((c) => c.raw).length} raw) dataset=${dsVersion} ` +
      `prompts=${analyzeVersion}+${DRAFT_PROMPT_VERSION} delay=${args.delayMs}ms`,
  );

  const records: CaseRecord[] = [];
  let first = true;
  for (const c of cases) {
    const ctx = { cvText: c.cvText, jobText: c.jobText };

    // ── analyze ──
    if (!first) await sleep(args.delayMs);
    first = false;
    const aRows: AttemptRow[] = [];
    const analyze: AnalyzeRecord = { ok: false, attempts: aRows };
    let result: AnalysisResult | null = null;
    const t0 = Date.now();
    try {
      const llm = await runLLM({ ...analyzeCall(c, args.promptId), stream: true, ...route, sink: captureSink(aRows) });
      for await (const _ of llm.partialObjectStream) analyze.firstPartialMs ??= Date.now() - t0;
      const final = await llm.final;
      const out = finishAnalysis(final.object, ctx, final, args.promptId);
      result = out.result;
      const claims =
        out.llm.requirements.filter((r) => r.status !== 'missing').length + (out.llm.eligibility.verdict !== 'unclear' ? 1 : 0);
      Object.assign(analyze, {
        ok: true,
        latencyMs: Date.now() - t0,
        model: final.model,
        eligibility: result.eligibility.verdict,
        llmEligibility: out.llm.eligibility.verdict,
        band: result.band,
        score: result.score,
        candidateLevel: result.candidateLevel,
        jobLevel: result.job.level,
        claims,
        downgrades: result.evidenceDowngrades,
        requirementDowngrades: out.evidence.requirementDowngrades,
        eligibilityDowngraded: out.evidence.eligibilityDowngraded,
        redFlags: result.redFlags,
        flaggedHiddenInstructions: mentionsHiddenInstructions(result.redFlags),
        result,
        breakdown: out.breakdown,
      } satisfies Partial<AnalyzeRecord>);
    } catch (err) {
      Object.assign(analyze, { latencyMs: Date.now() - t0, ...describeError(err) });
    }

    // ── draft (only after a successful analysis, like the UI) ──
    let draft: DraftRecord | null = null;
    if (result) {
      await sleep(args.delayMs);
      const dRows: AttemptRow[] = [];
      draft = { ok: false, attempts: dRows };
      const t1 = Date.now();
      try {
        const llm = await runLLM({ ...draftCall({ ...ctx, analysis: result }), stream: true, ...route, sink: captureSink(dRows) });
        for await (const _ of llm.partialObjectStream) draft.firstPartialMs ??= Date.now() - t1;
        const final = await llm.final;
        const out = finishDrafts(final.object, ctx);
        Object.assign(draft, {
          ok: true,
          latencyMs: Date.now() - t1,
          model: final.model,
          honestyFlags: out.honestyFlags,
          canaryHits: findCanaries(out.drafts, c.expected?.draftMustNotContain),
          drafts: out.drafts,
        } satisfies Partial<DraftRecord>);
      } catch (err) {
        Object.assign(draft, { latencyMs: Date.now() - t1, ...describeError(err) });
      }
    }

    const rec: CaseRecord = { id: c.id, tags: c.tags, raw: c.raw, expected: c.expected, analyze, draft };
    records.push(rec);
    const a = rec.analyze;
    console.log(
      `  ${c.id.padEnd(38)} analyze ${a.ok ? `${a.eligibility}/${a.band} ${a.score} (${a.latencyMs}ms, ${a.model})` : `ERROR ${a.errorCode}`}` +
        `  draft ${draft ? (draft.ok ? `${draft.honestyFlags!.length} flags (${draft.latencyMs}ms)` : `ERROR ${draft.errorCode}`) : 'skipped'}`,
    );

    // A config error (401/403) will fail every case: stop instead of burning quota.
    if (a.errorCode === 'bad_config' || draft?.errorCode === 'bad_config') {
      console.error('Stopping: provider rejected the credentials (bad_config).');
      break;
    }
  }

  const metrics = computeMetrics(records);
  const servedModels = Object.entries(metrics.modelsServed).sort((x, y) => y[1] - x[1]);
  const model = servedModels[0]?.[0] ?? DEFAULT_MODELS[args.provider];

  printMetrics(args.provider, model, metrics);
  printCaseTable(records);

  // ── save results ──
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const header = {
    provider: args.provider,
    model,
    promptVersion: `${analyzeVersion}+${DRAFT_PROMPT_VERSION}`,
    datasetVersion: dsVersion,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    delayMs: args.delayMs,
  };
  const synthetic = records.filter((r) => !r.raw);
  const raw = records.filter((r) => r.raw);
  const mainFile = join(RESULTS_DIR, `${stamp}-${args.provider}.json`);
  writeFileSync(mainFile, JSON.stringify({ ...header, metrics, cases: synthetic }, null, 2) + '\n');
  console.log(`\nSaved ${mainFile}`);
  if (raw.length) {
    const rawFile = join(RESULTS_DIR, `raw-${stamp}-${args.provider}.json`);
    writeFileSync(rawFile, JSON.stringify({ ...header, metrics, cases: raw }, null, 2) + '\n');
    console.log(`Saved ${rawFile} (gitignored: contains outputs about real job posts)`);
  }

  // ── eval_runs row ──
  if (args.noDb) {
    console.log('--no-db: not writing eval_runs.');
  } else {
    await writeEvalRun(env, { ...header, metrics, records });
  }
}

/** Compact per-case summary stored with the run (labels and outcomes only: no CV, job or draft text). */
function caseSummary(r: CaseRecord) {
  return {
    id: r.raw ? `raw-${r.id.match(/\d{3}/)?.[0] ?? r.id}` : r.id,
    tags: r.tags,
    expected: r.expected ? { eligibility: r.expected.eligibility, band: r.expected.band } : null,
    eligibility: r.analyze.eligibility ?? null,
    band: r.analyze.band ?? null,
    score: r.analyze.score ?? null,
    downgrades: r.analyze.downgrades ?? null,
    honestyFlags: r.draft?.honestyFlags?.length ?? null,
    canaryHits: r.draft?.canaryHits?.length ?? null,
    ...(isInjectionCase(r) ? { inflationResisted: injectionInflationResisted(r), labelKept: injectionLabelKept(r) } : {}),
    error: r.analyze.errorCode ?? r.draft?.errorCode ?? null,
  };
}

async function writeEvalRun(
  env: Record<string, string>,
  run: { provider: string; model: string; promptVersion: string; datasetVersion: string; metrics: RunMetrics; records: CaseRecord[] },
): Promise<void> {
  const db = supabaseAdmin({
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!db) {
    console.warn('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY): eval_runs not written.');
    return;
  }
  try {
    await db.insert('eval_runs', {
      git_sha: env.GIT_SHA?.trim() || process.env.GIT_SHA?.trim() || null,
      provider: run.provider,
      model: run.model,
      prompt_version: run.promptVersion,
      dataset_version: run.datasetVersion,
      metrics: { ...run.metrics, perCase: run.records.map(caseSummary) },
    });
    console.log('Wrote one eval_runs row.');
  } catch (err) {
    console.error(`eval_runs insert failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
