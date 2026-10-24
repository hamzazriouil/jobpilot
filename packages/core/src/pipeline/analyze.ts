import { z } from 'zod';
import { ANALYZE_PROMPT_VERSION, buildAnalyzePrompt, type AnalyzePromptInput } from '../prompts';
import { AnalysisLLM, Eligibility, Gap, Requirement, type AnalysisResult } from '../schemas';
import { toAnalysisResultDetailed, type EvidenceCheckResult, type EvidenceContext, type ScoreBreakdown } from '../scoring';
import { trimToLength } from './text';

// The provider-independent half of POST /api/analyze (docs/05-ARCHITECTURE.md §5.1), shared by the
// route and the eval runner so evals measure exactly what users get:
//   analyzeCall()   → prompt + run options for runLLM (the caller adds routing, sink and stream mode)
//   finishAnalysis() → normalize the LLM object → evidence check → deterministic score → AnalysisResult

/** Workers AI defaults to 256 output tokens, which truncates the JSON. A full analysis is ~1.5k. */
export const ANALYZE_MAX_OUTPUT_TOKENS = 4096;

// What the analyze LLM call is validated against, then normalized into the AnalysisLLM contract.
// Same idea as DraftsLLMUncapped: small deviations a model makes (a null field left out, a note a
// few characters over its cap, a 4th gap) are fixed in code instead of costing a schema-repair LLM
// call. Llama on Workers AI omits `evidenceQuote` on missing items in about one call in two.
// Enums, required fields and the 1..n requirements rule stay strict.

const RequirementIn = Requirement.extend({
  text: z.string(),
  note: z.string(),
  evidenceQuote: z.string().nullish(),
});

const EligibilityIn = Eligibility.extend({
  evidenceQuote: z.string().nullish(),
  reasoning: z.string(),
});

export const AnalysisLLMTransport = AnalysisLLM.extend({
  job: AnalysisLLM.shape.job.extend({ company: z.string().nullish() }),
  eligibility: EligibilityIn,
  requirements: z.array(RequirementIn).min(1),
  gaps: z.array(Gap.extend({ howToClose: z.string() })),
  redFlags: z.array(z.string()),
});
export type AnalysisLLMTransport = z.infer<typeof AnalysisLLMTransport>;

/** Fills nulls, clamps strings to the contract caps and trims arrays. Throws if still invalid. */
export function finalizeAnalysis(raw: AnalysisLLMTransport): AnalysisLLM {
  return AnalysisLLM.parse({
    ...raw,
    job: { ...raw.job, company: raw.job.company ?? null },
    eligibility: {
      ...raw.eligibility,
      evidenceQuote: raw.eligibility.evidenceQuote ?? null,
      reasoning: trimToLength(raw.eligibility.reasoning, 300),
    },
    requirements: raw.requirements.slice(0, 20).map((r) => ({
      ...r,
      text: trimToLength(r.text, 160),
      note: trimToLength(r.note, 200),
      evidenceQuote: r.evidenceQuote ?? null,
    })),
    gaps: raw.gaps.slice(0, 3).map((g) => ({ ...g, howToClose: trimToLength(g.howToClose, 240) })),
    redFlags: raw.redFlags.slice(0, 5).map((f) => trimToLength(f, 160)),
  });
}

/** Everything runLLM needs for the analyze call except routing (plan, country, providers), sink and stream. */
export function analyzeCall(input: AnalyzePromptInput) {
  const prompt = buildAnalyzePrompt(input);
  return {
    task: 'analyze',
    system: prompt.system,
    prompt: prompt.prompt,
    temperature: prompt.temperature,
    maxOutputTokens: ANALYZE_MAX_OUTPUT_TOKENS,
    schema: AnalysisLLMTransport,
    promptVersion: ANALYZE_PROMPT_VERSION,
  } as const;
}

export interface AnalysisOutcome {
  /** What the client receives (after the evidence check, with the server-computed score). */
  result: AnalysisResult;
  /** The normalized LLM judgment before the evidence check. */
  llm: AnalysisLLM;
  evidence: EvidenceCheckResult;
  breakdown: ScoreBreakdown;
}

/** Steps 4–5 of §5.1 on the validated LLM object. Throws a ZodError if the result breaks the contract. */
export function finishAnalysis(
  raw: AnalysisLLMTransport,
  ctx: EvidenceContext,
  served: { provider: string; model: string },
): AnalysisOutcome {
  const llm = finalizeAnalysis(raw);
  const { result, evidence, breakdown } = toAnalysisResultDetailed(llm, ctx, {
    provider: served.provider,
    model: served.model,
    promptVersion: ANALYZE_PROMPT_VERSION,
  });
  return { result, llm, evidence, breakdown };
}
