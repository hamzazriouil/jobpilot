import { AnalysisResult, type AnalysisLLM } from '../schemas';
import { applyEvidenceCheck, type EvidenceContext } from './evidence';
import { computeScore } from './score';

export interface AnalysisMeta {
  provider: string;
  model: string;
  promptVersion: string;
}

/**
 * Server-side finish of the analyze pipeline (Architecture §5.1 steps 4–5):
 * evidence check → deterministic score → validated AnalysisResult.
 * Throws a ZodError if the final object doesn't satisfy the contract.
 */
export function toAnalysisResult(llm: AnalysisLLM, ctx: EvidenceContext, meta: AnalysisMeta): AnalysisResult {
  const { analysis, downgrades } = applyEvidenceCheck(llm, ctx);
  const { score, band } = computeScore(analysis);
  return AnalysisResult.parse({
    ...analysis,
    score,
    band,
    evidenceDowngrades: downgrades,
    provider: meta.provider,
    model: meta.model,
    promptVersion: meta.promptVersion,
  });
}
