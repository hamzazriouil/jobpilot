import { consoleSink, type LlmCallSink } from '@jobpilot/core/llm';
import type { RequestContext } from './env';
import type { SupabaseAdmin } from './supabase';

// Wires runLLM to this app's env (docs/05-ARCHITECTURE.md §4, §12, §15). No feature code builds
// providers itself: routes call buildProviderConfig() + llmSink() + routingCountry().
// buildProviderConfig (env → ProviderConfig, incl. the Gemini model overrides and the Workers AI
// REST-vs-binding choice) lives in @jobpilot/core/pipeline so the eval runner builds providers the
// same way; it is re-exported here for existing imports.
export { buildProviderConfig, parseFallbackModels, parseThinkingLevel } from '@jobpilot/core/pipeline';

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
