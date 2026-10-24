import {
  GEMINI_THINKING_LEVELS,
  type GeminiModelSpec,
  type GeminiThinkingLevel,
  type LlmPlan,
  type ProviderConfig,
  type ProviderKey,
  type WorkersAiBinding,
  type WorkersConfig,
} from '../llm';

// Env → ProviderConfig (docs/05-ARCHITECTURE.md §4, §15), shared by apps/web and the eval runner.
// Model defaults (gemini-3.5-flash-lite, then gemini-3.6-flash with 'minimal' thinking) live in
// ../llm/providers.ts; the env vars below only override them.

/** The env keys that configure LLM providers. apps/web's AppEnv satisfies this. */
export interface ProviderEnv {
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_THINKING_LEVEL?: string;
  GEMINI_FALLBACK_MODELS?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  CLAUDE_ENABLED?: string;
  AI?: WorkersAiBinding;
}

/** GEMINI_THINKING_LEVEL: a level, 'off' (null = never send one), or empty (undefined = core default). */
export function parseThinkingLevel(raw: string | undefined): GeminiThinkingLevel | null | undefined {
  const v = raw?.trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'off' || v === 'none') return null;
  return (GEMINI_THINKING_LEVELS as readonly string[]).includes(v) ? (v as GeminiThinkingLevel) : undefined;
}

/** GEMINI_FALLBACK_MODELS: comma-separated ids, 'none' (no Gemini fallback), or empty (core default). */
export function parseFallbackModels(raw: string | undefined): GeminiModelSpec[] | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (v.toLowerCase() === 'none') return [];
  return v
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
    .map((model) => ({ model }));
}

/**
 * Workers AI: the `AI` binding in production. Outside production (next dev, Node scripts) REST mode
 * (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN) is preferred when both are set, because the binding
 * only works there with CF_REMOTE_BINDINGS=1 + wrangler auth.
 */
function workersConfig(env: ProviderEnv, isProd: boolean): WorkersConfig | undefined {
  if (!isProd && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    return { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN };
  }
  return env.AI ? { binding: env.AI } : undefined;
}

export function buildProviderConfig(env: ProviderEnv, isProd: boolean): ProviderConfig {
  const geminiKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  const claudeKey = env.ANTHROPIC_API_KEY?.trim();
  return {
    gemini: geminiKey
      ? {
          apiKey: geminiKey,
          model: env.GEMINI_MODEL?.trim() || undefined,
          thinkingLevel: parseThinkingLevel(env.GEMINI_THINKING_LEVEL),
          fallbacks: parseFallbackModels(env.GEMINI_FALLBACK_MODELS),
        }
      : undefined,
    workers: workersConfig(env, isProd),
    claude: claudeKey ? { apiKey: claudeKey } : undefined,
    claudeEnabled: env.CLAUDE_ENABLED === 'true',
  };
}

export interface ForcedRoute {
  providers: ProviderConfig;
  plan: LlmPlan;
  /** A routing country (never the candidate's country) whose route starts with the forced provider. */
  country: string;
}

/**
 * runLLM options that reach ONLY `provider`: the config keeps just that provider, so the router's
 * cross-provider fallback (gemini → workers) has nothing to fall back to. Gemini keeps its own
 * model fallback chain. Used by the eval runner, where a silent fallback would mix providers.
 * Returns null when the provider isn't configured.
 */
export function forceProvider(config: ProviderConfig, provider: ProviderKey): ForcedRoute | null {
  switch (provider) {
    case 'gemini':
      return config.gemini ? { providers: { gemini: config.gemini }, plan: 'free', country: 'US' } : null;
    case 'workers':
      return config.workers ? { providers: { workers: config.workers }, plan: 'free', country: 'DE' } : null;
    case 'claude':
      return config.claude
        ? { providers: { claude: config.claude, claudeEnabled: true }, plan: 'sprint30', country: 'DE' }
        : null;
  }
}
