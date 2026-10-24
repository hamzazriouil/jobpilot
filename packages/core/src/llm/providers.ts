import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { dedupingBinding, dedupingFetch } from './workers-sse';

/**
 * Provider factories. Core never reads `process.env`: the caller (apps/web, workers/ingest,
 * scripts) builds a `ProviderConfig` from its own env/bindings and passes it in.
 */

export type ProviderKey = 'gemini' | 'workers' | 'claude';

/** A concrete (non-string) AI SDK language model instance. */
export type LanguageModelInstance = Exclude<LanguageModel, string>;

/**
 * Benchmarked 2026-10-24 on the free tier (SAMPLE_CV × SAMPLE_JOB, analyze.v1, structured stream):
 * - gemini-3.8-flash: ~87s on a one-word prompt. gemini-3.7-flash: 503. Both unusable.
 * - gemini-3.6-flash: default thinking 18.1s; thinkingLevel 'minimal' 7.8s with the same analysis
 *   (77 / good / eligible, 0 downgrades). But 6 of its 9 calls that day failed (503, one mid-stream).
 * - gemini-3.5-flash-lite (default thinking): 8.5s / 4.1s, same 77 / good / eligible, 0 downgrades,
 *   no failures. So it is the main model, with gemini-3.6-flash as the first fallback.
 * Override with GEMINI_MODEL / GEMINI_FALLBACK_MODELS in apps/web.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export const GEMINI_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
export type GeminiThinkingLevel = (typeof GEMINI_THINKING_LEVELS)[number];

/** Benchmarked thinking level per model, sent when the caller doesn't choose one. */
export const GEMINI_DEFAULT_THINKING: Readonly<Record<string, GeminiThinkingLevel>> = Object.freeze({
  'gemini-3.6-flash': 'minimal',
});

export interface GeminiModelSpec {
  model: string;
  /**
   * Sent as this model's default `providerOptions.google.thinkingConfig.thinkingLevel`.
   * undefined → GEMINI_DEFAULT_THINKING[model], or none for unlisted models (levels are
   * model-specific and a wrong one is a 400); null → never send one.
   */
  thinkingLevel?: GeminiThinkingLevel | null;
}

/** Tried in order after the main Gemini model fails with a retryable error, before Workers AI. */
export const DEFAULT_GEMINI_FALLBACKS: readonly GeminiModelSpec[] = Object.freeze([{ model: 'gemini-3.6-flash' }]);
/** Workers AI 70B instruct with JSON-mode support (§4.1). */
export const DEFAULT_WORKERS_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';

export const DEFAULT_MODELS: Record<ProviderKey, string> = {
  gemini: DEFAULT_GEMINI_MODEL,
  workers: DEFAULT_WORKERS_MODEL,
  claude: DEFAULT_CLAUDE_MODEL,
};

/**
 * Structural type for the Workers AI binding (`env.AI`). Kept structural so core does not
 * depend on the ambient `Ai` global from @cloudflare/workers-types; `env.AI` satisfies it.
 */
export interface WorkersAiBinding {
  run(...args: never[]): unknown;
}

/** Escape hatch for tests/evals: pass an already-built model (e.g. `MockLanguageModelV4`). */
export interface PrebuiltModelConfig {
  languageModel: LanguageModelInstance;
  /** See ResolvedModel.nativeStructuredStream. Default true. */
  nativeStructuredStream?: boolean;
}

export type GeminiConfig =
  | {
      apiKey: string;
      model?: string;
      thinkingLevel?: GeminiThinkingLevel | null;
      /** Default DEFAULT_GEMINI_FALLBACKS; [] disables the Gemini-to-Gemini fallback. */
      fallbacks?: readonly GeminiModelSpec[];
    }
  | PrebuiltModelConfig;

export type WorkersConfig =
  | { binding: WorkersAiBinding; model?: string }
  /** REST mode (Node scripts / evals outside a Worker). */
  | { accountId: string; apiToken: string; model?: string }
  | PrebuiltModelConfig;

export type ClaudeConfig = { apiKey: string; model?: string } | PrebuiltModelConfig;

export interface ProviderConfig {
  gemini?: GeminiConfig;
  workers?: WorkersConfig;
  claude?: ClaudeConfig;
  /** `CLAUDE_ENABLED` env flag. Claude is only routed to when this is true AND `claude` is configured. */
  claudeEnabled?: boolean;
}

export interface ResolvedModel {
  provider: ProviderKey;
  /** Model id as recorded in `llm_calls.model`. */
  modelId: string;
  model: LanguageModelInstance;
  /**
   * false when the provider can't stream a schema-constrained response. Workers AI's JSON mode
   * (`response_format`) answers non-streaming, and workers-ai-provider wraps that as ONE chunk, so
   * stream mode would show nothing until the end. runLLM then streams plain text instead (the
   * prompts spell out the JSON shape) and validates the final text with the schema + one repair.
   */
  nativeStructuredStream: boolean;
}

function isPrebuilt(c: object): c is PrebuiltModelConfig {
  return 'languageModel' in c;
}

export function geminiThinkingLevelFor(spec: GeminiModelSpec): GeminiThinkingLevel | null {
  if (spec.thinkingLevel !== undefined) return spec.thinkingLevel;
  return GEMINI_DEFAULT_THINKING[spec.model] ?? null;
}

function buildGemini(google: ReturnType<typeof createGoogle>, spec: GeminiModelSpec): ResolvedModel {
  const level = geminiThinkingLevelFor(spec);
  const base = google(spec.model);
  // The thinking level rides on the model (not the call), so each model in the fallback chain
  // gets its own and a caller's providerOptions can't send an unsupported level to the wrong model.
  const model = level
    ? wrapLanguageModel({
        model: base,
        middleware: defaultSettingsMiddleware({
          settings: { providerOptions: { google: { thinkingConfig: { thinkingLevel: level } } } },
        }),
      })
    : base;
  return { provider: 'gemini', modelId: spec.model, model, nativeStructuredStream: true };
}

export function createGeminiModel(config: GeminiConfig): ResolvedModel {
  return createGeminiModels(config)[0]!;
}

/** The main Gemini model followed by its fallbacks (duplicates removed). */
export function createGeminiModels(config: GeminiConfig): ResolvedModel[] {
  if (isPrebuilt(config)) return [prebuilt('gemini', config)];
  const google = createGoogle({ apiKey: config.apiKey });
  const main: GeminiModelSpec = { model: config.model ?? DEFAULT_GEMINI_MODEL, thinkingLevel: config.thinkingLevel };
  const specs = [main, ...(config.fallbacks ?? DEFAULT_GEMINI_FALLBACKS).filter((f) => f.model !== main.model)];
  return specs.map((s) => buildGemini(google, s));
}

type WorkersAIOptions = Parameters<typeof createWorkersAI>[0];
type WorkersAIBindingOption = Extract<WorkersAIOptions, { binding: unknown }>['binding'];

export function createWorkersModel(config: WorkersConfig): ResolvedModel {
  if (isPrebuilt(config)) return prebuilt('workers', config);
  const modelId = config.model ?? DEFAULT_WORKERS_MODEL;
  // Both transports go through the duplicate-token fix in workers-sse.ts.
  const workersai =
    'binding' in config
      ? createWorkersAI({ binding: dedupingBinding(config.binding) as unknown as WorkersAIBindingOption })
      : createWorkersAI({ accountId: config.accountId, apiKey: config.apiToken, fetch: dedupingFetch() });
  return { provider: 'workers', modelId, model: workersai(modelId) as LanguageModelInstance, nativeStructuredStream: false };
}

export function createClaudeModel(config: ClaudeConfig): ResolvedModel {
  if (isPrebuilt(config)) return prebuilt('claude', config);
  const modelId = config.model ?? DEFAULT_CLAUDE_MODEL;
  const anthropic = createAnthropic({ apiKey: config.apiKey });
  return { provider: 'claude', modelId, model: anthropic(modelId), nativeStructuredStream: true };
}

/** Builds the model for `provider`, or returns null when that provider is not configured. */
export function resolveModel(provider: ProviderKey, config: ProviderConfig): ResolvedModel | null {
  switch (provider) {
    case 'gemini':
      return config.gemini && hasCredentials(config.gemini) ? createGeminiModel(config.gemini) : null;
    case 'workers':
      return config.workers && hasCredentials(config.workers) ? createWorkersModel(config.workers) : null;
    case 'claude':
      return config.claude && hasCredentials(config.claude) ? createClaudeModel(config.claude) : null;
  }
}

/**
 * Every model to try for `provider`, in order (empty when not configured). Only Gemini has more
 * than one: its main model, then DEFAULT_GEMINI_FALLBACKS / `fallbacks`.
 */
export function resolveModels(provider: ProviderKey, config: ProviderConfig): ResolvedModel[] {
  if (provider === 'gemini') {
    return config.gemini && hasCredentials(config.gemini) ? createGeminiModels(config.gemini) : [];
  }
  const one = resolveModel(provider, config);
  return one ? [one] : [];
}

function hasCredentials(c: GeminiConfig | WorkersConfig | ClaudeConfig): boolean {
  if (isPrebuilt(c)) return true;
  if ('binding' in c) return c.binding != null;
  if ('accountId' in c) return Boolean(c.accountId && c.apiToken);
  return Boolean(c.apiKey);
}

function prebuilt(provider: ProviderKey, c: PrebuiltModelConfig): ResolvedModel {
  return {
    provider,
    modelId: c.languageModel.modelId,
    model: c.languageModel,
    nativeStructuredStream: c.nativeStructuredStream ?? true,
  };
}
