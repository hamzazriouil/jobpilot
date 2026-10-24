// Registry of analyze prompt versions (docs/05-ARCHITECTURE.md §7.1, §13). The pipeline picks one by
// id; the version string of the one used is recorded in `llm_calls`, on the analysis and in `eval_runs`.
// A new prompt version becomes the default only after it passes the eval gate on every provider.

import type { BuiltPrompt } from './util';
import { ANALYZE_PROMPT_VERSION, buildAnalyzePrompt, type AnalyzePromptInput } from './analyze.v1';
import { ANALYZE_V2_PROMPT_VERSION, buildAnalyzePromptV2 } from './analyze.v2';

export interface AnalyzePromptDef {
  /** Stored string, e.g. "analyze.v2". */
  version: string;
  build: (input: AnalyzePromptInput) => BuiltPrompt;
}

export const ANALYZE_PROMPTS = {
  v1: { version: ANALYZE_PROMPT_VERSION, build: buildAnalyzePrompt },
  v2: { version: ANALYZE_V2_PROMPT_VERSION, build: buildAnalyzePromptV2 },
} as const satisfies Record<string, AnalyzePromptDef>;

export type AnalyzePromptId = keyof typeof ANALYZE_PROMPTS;
export const ANALYZE_PROMPT_IDS = Object.keys(ANALYZE_PROMPTS) as AnalyzePromptId[];

/**
 * The version users get. Change only after the eval gate passes (evals/README, §13).
 * v2 since 2026-10-24: passed on Gemini; Workers latency criterion overridden (see evals/DECISIONS.md).
 */
export const DEFAULT_ANALYZE_PROMPT: AnalyzePromptId = 'v2';
export const DEFAULT_ANALYZE_PROMPT_VERSION: string = ANALYZE_PROMPTS[DEFAULT_ANALYZE_PROMPT].version;

/**
 * "v2" or "analyze.v2" → "v2". Empty/undefined → the default. Throws on anything else, so a typo in
 * a flag or env var fails loudly instead of silently running another prompt.
 */
export function resolveAnalyzePromptId(value: string | null | undefined): AnalyzePromptId {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return DEFAULT_ANALYZE_PROMPT;
  const id = v.startsWith('analyze.') ? v.slice('analyze.'.length) : v;
  if ((ANALYZE_PROMPT_IDS as string[]).includes(id)) return id as AnalyzePromptId;
  throw new Error(`Unknown analyze prompt "${value}": use one of ${ANALYZE_PROMPT_IDS.join(', ')}`);
}
