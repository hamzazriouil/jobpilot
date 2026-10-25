import type { EmbedDeps } from '@jobpilot/core/embed';
import type { RequestContext } from './env';

// Workers AI embeddings for route handlers (docs/09-PHASE1-CONTRACT.md §4): the `AI` binding in
// production; in `next dev` the REST API when CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN are set
// (the binding there needs CF_REMOTE_BINDINGS=1), same choice as the LLM provider config.

export function embedDeps(rc: Pick<RequestContext, 'env' | 'isProd'>): EmbedDeps | null {
  const { env } = rc;
  if (!rc.isProd && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
    return { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN };
  }
  return env.AI ? { binding: env.AI } : null;
}
