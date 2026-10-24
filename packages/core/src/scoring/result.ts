import { AnalysisResult, type AnalysisLLM } from '../schemas';
import { applyEvidenceCheck, type EvidenceCheckResult, type EvidenceContext } from './evidence';
import { computeScore, type ScoreBreakdown } from './score';

export interface AnalysisMeta {
  provider: string;
  model: string;
  promptVersion: string;
}

/** toAnalysisResult plus the intermediate steps (for evals and logs). */
export interface AnalysisResultDetail {
  result: AnalysisResult;
  evidence: EvidenceCheckResult;
  breakdown: ScoreBreakdown;
}

/** Same pipeline as toAnalysisResult, also returning the evidence check and score breakdown. */
export function toAnalysisResultDetailed(llm: AnalysisLLM, ctx: EvidenceContext, meta: AnalysisMeta): AnalysisResultDetail {
  const evidence = applyEvidenceCheck(llm, ctx);
  const { score, band, breakdown } = computeScore(evidence.analysis);
  const result = AnalysisResult.parse({
    ...evidence.analysis,
    score,
    band,
    evidenceDowngrades: evidence.downgrades,
    provider: meta.provider,
    model: meta.model,
    promptVersion: meta.promptVersion,
  });
  return { result, evidence, breakdown };
}

/**
 * Server-side finish of the analyze pipeline (Architecture §5.1 steps 4–5):
 * evidence check → deterministic score → validated AnalysisResult.
 * Throws a ZodError if the final object doesn't satisfy the contract.
 */
export function toAnalysisResult(llm: AnalysisLLM, ctx: EvidenceContext, meta: AnalysisMeta): AnalysisResult {
  return toAnalysisResultDetailed(llm, ctx, meta).result;
}
