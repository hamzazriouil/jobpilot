import { z } from 'zod';
import type { AppEnv } from './env';

// Reads `eval_runs` (written by evals/run.ts) for the public /evals page. Server only, service
// role, same fetch-over-PostgREST approach as ./supabase.ts. The table is public-read by RLS, but
// the service role keeps one access pattern for all server reads in v0.

const EVAL_RUNS_TIMEOUT_MS = 5_000;
const MAX_RUNS = 200;

const rate = z.number().nullable().optional();

/** metrics jsonb: parsed leniently, since older runs may lack newer keys. */
const EvalMetrics = z
  .object({
    cases: z.number().optional(),
    labeledCases: z.number().optional(),
    eligibilityAcc: rate,
    bandAcc: rate,
    bandWithin1: rate,
    schemaValid: rate,
    repairRate: rate,
    downgradeRate: rate,
    honestyFlagRate: rate,
    injectionCases: z.number().optional(),
    injectionPassed: z.number().optional(),
    p50ms: rate,
    p95ms: rate,
    draftP50ms: rate,
    draftP95ms: rate,
    costPerCase: rate,
    calls: z.number().optional(),
    errors: z.number().optional(),
    modelsServed: z.record(z.string(), z.number()).optional(),
    perCase: z
      .array(
        z.object({
          id: z.string(),
          tags: z.array(z.string()).optional(),
          expected: z.object({ eligibility: z.string(), band: z.string() }).nullable().optional(),
          eligibility: z.string().nullable().optional(),
          band: z.string().nullable().optional(),
          score: z.number().nullable().optional(),
          error: z.string().nullable().optional(),
        }),
      )
      .optional(),
  })
  .loose();
export type EvalMetrics = z.infer<typeof EvalMetrics>;

const EvalRun = z.object({
  id: z.string(),
  provider: z.string(),
  model: z.string(),
  prompt_version: z.string(),
  dataset_version: z.string(),
  metrics: EvalMetrics,
  created_at: z.string(),
});
export type EvalRun = z.infer<typeof EvalRun>;

export type EvalRunsResult = { ok: true; runs: EvalRun[] } | { ok: false };

/** Newest first. `{ ok: false }` when Supabase isn't configured or the read fails (logged). */
export async function listEvalRuns(env: AppEnv): Promise<EvalRunsResult> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return { ok: false };
  try {
    const res = await fetch(
      `${url}/rest/v1/eval_runs?select=id,provider,model,prompt_version,dataset_version,metrics,created_at&order=created_at.desc&limit=${MAX_RUNS}`,
      {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(EVAL_RUNS_TIMEOUT_MS),
      },
    );
    if (!res.ok) throw new Error(`eval_runs → ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const rows = z.array(z.unknown()).parse(await res.json());
    // Skip a malformed row instead of failing the whole page.
    const runs = rows.flatMap((r) => {
      const p = EvalRun.safeParse(r);
      return p.success ? [p.data] : [];
    });
    return { ok: true, runs };
  } catch (err) {
    console.error(JSON.stringify({ type: 'eval_runs_read_failed', message: String(err) }));
    return { ok: false };
  }
}

/** Latest run per provider (input newest first), in a stable provider order. */
export function latestPerProvider(runs: readonly EvalRun[]): EvalRun[] {
  const order = ['gemini', 'workers', 'claude'];
  const seen = new Map<string, EvalRun>();
  for (const r of runs) if (!seen.has(r.provider)) seen.set(r.provider, r);
  return [...seen.values()].sort(
    (a, b) => (order.indexOf(a.provider) + 1 || 99) - (order.indexOf(b.provider) + 1 || 99),
  );
}
