import { z } from 'zod';
import { AnalysisLLM, Eligibility, Gap, Requirement } from '@jobpilot/core/schemas';
import { trimToLength } from './drafts';

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
