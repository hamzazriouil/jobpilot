import {
  consoleSink,
  GEMINI_THINKING_LEVELS,
  type GeminiModelSpec,
  type GeminiThinkingLevel,
  type LlmCallSink,
  type ProviderConfig,
  type WorkersConfig,
} from '@jobpilot/core/llm';
import type { AppEnv, RequestContext } from './env';
import type { SupabaseAdmin } from './supabase';

// Wires runLLM to this app's env (docs/05-ARCHITECTURE.md §4, §12, §15). No feature code builds
// providers itself: routes call buildProviderConfig() + llmSink() + routingCountry().
// Model defaults (gemini-3.5-flash-lite, then gemini-3.6-flash with 'minimal' thinking) live in
// packages/core/src/llm/providers.ts; the env vars below only override them.

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
 * Workers AI: the `AI` binding in production. In `next dev` the binding only works with
 * CF_REMOTE_BINDINGS=1 + wrangler auth, so REST mode (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN,
 * dev only) is preferred there when both are set.
 */
function workersConfig(env: AppEnv, isProd: boolean): WorkersConfig | undefined {
  if (!isProd && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    return { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN };
  }
  return env.AI ? { binding: env.AI } : undefined;
}

export function buildProviderConfig(env: AppEnv, isProd: boolean): ProviderConfig {
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

/**
 * Country used for provider routing: Cloudflare `request.cf.country`, else the `cf-ipcountry`
 * header. Outside production, an `x-dev-country` request header (to try EEA routing per request)
 * or else DEV_COUNTRY_OVERRIDE wins. Never the user's self-declared country.
 * null/unknown is routed like the EEA (Workers AI only) by pickProviderOrder: that's intended.
 */
export function routingCountry(request: Request, rc: Pick<RequestContext, 'cf' | 'env' | 'isProd'>): string | null {
  if (!rc.isProd) {
    const override = request.headers.get('x-dev-country')?.trim() || rc.env.DEV_COUNTRY_OVERRIDE?.trim();
    if (override) return override.toUpperCase();
  }
  const fromRequest = (request as Request & { cf?: { country?: unknown } }).cf?.country;
  const cfCountry = fromRequest ?? rc.cf?.country;
  if (typeof cfCountry === 'string' && cfCountry) return cfCountry;
  return request.headers.get('cf-ipcountry');
}

/**
 * One `llm_calls` row per attempt, inserted fire-and-forget through `ctx.waitUntil` so logging
 * never slows the stream. Rows carry metrics only (no prompt, CV or job text; see LlmCallRow).
 * Falls back to structured console logs when Supabase isn't configured.
 */
export function llmSink(db: SupabaseAdmin | null, waitUntil: (p: Promise<unknown>) => void): LlmCallSink {
  if (!db) return consoleSink;
  return {
    record(row) {
      waitUntil(
        db.insert('llm_calls', { ...row }).catch((err: unknown) => {
          console.error(JSON.stringify({ type: 'llm_calls_insert_failed', feature: row.feature, message: String(err) }));
        }),
      );
    },
  };
}
