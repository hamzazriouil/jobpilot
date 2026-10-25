import { consoleSink, type ProviderConfig } from '@jobpilot/core/llm';
import { createDb } from './db';
import {
  DEFAULT_LLM_FALLBACK_CAP,
  DEFAULT_MAX_PAGES,
  intVar,
  userAgent,
  type Env,
  type ExecutionContextLike,
  type ScheduledControllerLike,
} from './env';
import { consoleLog, errorText } from './log';
import { runIngest } from './pipeline';
import { getAdapter, type SourceAdapter } from './sources';

// jobpilot-ingest Worker (docs/05-ARCHITECTURE.md §5.4, docs/09-PHASE1-CONTRACT.md §5).
// Crons only: "0 */6 * * *" ingests every enabled source, "0 6 * * *" runs DB maintenance.
// The fetch handler is a 404 on purpose: there is no public trigger.

export const MAINTENANCE_CRON = '0 6 * * *';

function llmConfig(env: Env): ProviderConfig | null {
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  return key ? { gemini: { apiKey: key } } : null;
}

export async function scheduledIngest(env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.AI) {
    consoleLog('config_error', { missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AI'].filter((k) => !env[k as keyof Env]) });
    return;
  }
  const db = createDb({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  const enabled = await db.enabledSources();
  const adapters = enabled.map((s) => getAdapter(s.id)).filter((a): a is SourceAdapter => a !== null);
  const skipped = enabled.filter((s) => !getAdapter(s.id)).map((s) => s.id);
  if (skipped.length) consoleLog('no_adapter', { sources: skipped });

  const stats = await runIngest(
    adapters,
    {
      db,
      embed: { binding: env.AI },
      llm: llmConfig(env),
      llmSink: consoleSink,
      userAgent: userAgent(env.APP_URL),
      log: consoleLog,
      apiKeys: { himalayas: env.HIMALAYAS_API_KEY },
    },
    {
      dryRun: false,
      maxPages: intVar(env.INGEST_MAX_PAGES, DEFAULT_MAX_PAGES),
      llmCap: intVar(env.LLM_FALLBACK_CAP, DEFAULT_LLM_FALLBACK_CAP),
    },
  );
  consoleLog('ingest_done', {
    sources: stats.map((s) => ({ source: s.source, ok: s.ok, fresh: s.fresh, upserted: s.upserted })),
  });
}

export async function scheduledMaintenance(env: Env): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    consoleLog('config_error', { missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] });
    return;
  }
  const db = createDb({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  consoleLog('maintenance_done', { result: await db.runMaintenance() });
}

export default {
  async fetch(): Promise<Response> {
    return new Response('Not found', { status: 404 });
  },

  async scheduled(controller: ScheduledControllerLike, env: Env, _ctx: ExecutionContextLike): Promise<void> {
    try {
      if (controller.cron === MAINTENANCE_CRON) await scheduledMaintenance(env);
      else await scheduledIngest(env);
    } catch (err) {
      consoleLog('scheduled_error', { cron: controller.cron, error: errorText(err) });
      throw err; // marks the cron run as failed in the dashboard
    }
  },
};
