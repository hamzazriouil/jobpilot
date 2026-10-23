import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';

/**
 * Provider factories. Core never reads `process.env`: the caller (apps/web, workers/ingest,
 * scripts) builds a `ProviderConfig` from its own env/bindings and passes it in.
 */

export type ProviderKey = 'gemini' | 'workers' | 'claude';

/** A concrete (non-string) AI SDK language model instance. */
export type LanguageModelInstance = Exclude<LanguageModel, string>;

/** Newest Flash id listed in @ai-sdk/google 4.0.104 types. Check free-tier availability at signup. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
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
}

export type GeminiConfig = { apiKey: string; model?: string } | PrebuiltModelConfig;

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
}

function isPrebuilt(c: object): c is PrebuiltModelConfig {
  return 'languageModel' in c;
}

export function createGeminiModel(config: GeminiConfig): ResolvedModel {
  if (isPrebuilt(config)) return prebuilt('gemini', config);
  const modelId = config.model ?? DEFAULT_GEMINI_MODEL;
  const google = createGoogle({ apiKey: config.apiKey });
  return { provider: 'gemini', modelId, model: google(modelId) };
}

type WorkersAIOptions = Parameters<typeof createWorkersAI>[0];
type WorkersAIBindingOption = Extract<WorkersAIOptions, { binding: unknown }>['binding'];

export function createWorkersModel(config: WorkersConfig): ResolvedModel {
  if (isPrebuilt(config)) return prebuilt('workers', config);
  const modelId = config.model ?? DEFAULT_WORKERS_MODEL;
  const workersai =
    'binding' in config
      ? createWorkersAI({ binding: config.binding as unknown as WorkersAIBindingOption })
      : createWorkersAI({ accountId: config.accountId, apiKey: config.apiToken });
  return { provider: 'workers', modelId, model: workersai(modelId) as LanguageModelInstance };
}

export function createClaudeModel(config: ClaudeConfig): ResolvedModel {
  if (isPrebuilt(config)) return prebuilt('claude', config);
  const modelId = config.model ?? DEFAULT_CLAUDE_MODEL;
  const anthropic = createAnthropic({ apiKey: config.apiKey });
  return { provider: 'claude', modelId, model: anthropic(modelId) };
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

function hasCredentials(c: GeminiConfig | WorkersConfig | ClaudeConfig): boolean {
  if (isPrebuilt(c)) return true;
  if ('binding' in c) return c.binding != null;
  if ('accountId' in c) return Boolean(c.accountId && c.apiToken);
  return Boolean(c.apiKey);
}

function prebuilt(provider: ProviderKey, c: PrebuiltModelConfig): ResolvedModel {
  return { provider, modelId: c.languageModel.modelId, model: c.languageModel };
}
