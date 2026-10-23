import type { ProviderKey } from './providers';

export interface LlmUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

/** USD per 1M tokens. */
export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

const FREE: ModelPrice = { inputPerMTok: 0, outputPerMTok: 0 };

/**
 * Price table (§12). Free-tier providers cost 0, but tokens are still logged.
 * `*` is the per-provider fallback for model ids not listed explicitly.
 *
 * NOTE: if the Gemini key is ever moved to the paid tier, fill in real prices here.
 */
export const PRICE_TABLE: Record<ProviderKey, Record<string, ModelPrice>> = {
  gemini: { '*': FREE },
  workers: { '*': FREE },
  claude: {
    // TODO(verify before enabling Claude): PLACEHOLDER price, not checked against the current
    // Anthropic price list for claude-haiku-5-5. Update both numbers before CLAUDE_ENABLED=true.
    'claude-haiku-5-5': { inputPerMTok: 1, outputPerMTok: 5 },
    // TODO(verify): unknown Claude models fall back to the same placeholder.
    '*': { inputPerMTok: 1, outputPerMTok: 5 },
  },
};

export function getPrice(provider: ProviderKey, model: string): ModelPrice {
  const table = PRICE_TABLE[provider];
  return table[model] ?? table['*'] ?? FREE;
}

/** Estimated cost in USD, rounded to 6 decimals to match `llm_calls.cost_usd numeric(10,6)`. */
export function estimateCost(provider: ProviderKey, model: string, usage: LlmUsage): number {
  const price = getPrice(provider, model);
  const cost =
    ((usage.inputTokens ?? 0) * price.inputPerMTok + (usage.outputTokens ?? 0) * price.outputPerMTok) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}
