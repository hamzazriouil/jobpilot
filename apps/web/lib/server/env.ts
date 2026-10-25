import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { WorkersAiBinding } from '@jobpilot/core/llm';

// Env + bindings for route handlers (docs/05-ARCHITECTURE.md §15). Production: wrangler vars,
// `wrangler secret put` secrets and the `AI` binding. `next dev`: `.dev.vars`, exposed through
// getCloudflareContext() by initOpenNextCloudflareForDev() in next.config.ts.

export interface AppEnv {
  APP_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  /** Public anon key (RLS-protected). Read at runtime, never inlined at build time (Phase 1 auth). */
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  /** Optional override of the Gemini model id (default: DEFAULT_GEMINI_MODEL in @jobpilot/core/llm). */
  GEMINI_MODEL?: string;
  /** Optional override: minimal | low | medium | high | off. Default: GEMINI_DEFAULT_THINKING in core. */
  GEMINI_THINKING_LEVEL?: string;
  /** Optional: comma-separated Gemini models tried before Workers AI, or 'none'. Default in core. */
  GEMINI_FALLBACK_MODELS?: string;
  ANALYSIS_TOKEN_SECRET?: string;
  IP_HASH_SALT?: string;
  /** Dev only (ignored when NODE_ENV === 'production'): ISO-2 country used for provider routing. */
  DEV_COUNTRY_OVERRIDE?: string;
  /** Dev only: Workers AI over REST when the `AI` binding isn't usable from `next dev`. */
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  CLAUDE_ENABLED?: string;
  AI?: WorkersAiBinding;
}

export interface RequestContext {
  env: AppEnv;
  /** Cloudflare `request.cf` (undefined in plain `next dev`). */
  cf: { country?: unknown } | undefined;
  /** `ctx.waitUntil`: keeps fire-and-forget work (logging) alive after the response. */
  waitUntil(promise: Promise<unknown>): void;
  isProd: boolean;
}

export async function getRequestContext(): Promise<RequestContext> {
  const isProd = process.env.NODE_ENV === 'production';
  try {
    const { env, cf, ctx } = await getCloudflareContext({ async: true });
    return {
      env: env as unknown as AppEnv,
      cf: cf as { country?: unknown } | undefined,
      waitUntil: (p) => ctx.waitUntil(p),
      isProd,
    };
  } catch (err) {
    // Only reachable outside the Worker / without initOpenNextCloudflareForDev (e.g. `next start`).
    console.error(JSON.stringify({ type: 'cf_context_unavailable', message: String(err) }));
    return {
      env: process.env as unknown as AppEnv,
      cf: undefined,
      waitUntil: (p) => void p.catch(() => {}),
      isProd,
    };
  }
}
