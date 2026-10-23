/**
 * Live smoke test: one tiny structured call through each provider that has credentials in env.
 *
 *   npx tsx scripts/llm-smoke.ts            (from packages/core)
 *
 * Env (all optional; providers without credentials are skipped):
 *   GOOGLE_GENERATIVE_AI_API_KEY                gemini
 *   CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN workers (REST API; inside a Worker the AI binding is used instead)
 *   ANTHROPIC_API_KEY                           claude
 *   GEMINI_MODEL / WORKERS_MODEL / CLAUDE_MODEL  optional model-id overrides
 *
 * Each provider is exercised through the real router (runLLM) with a route that only reaches it.
 */
import { z } from 'zod';
import {
  LlmError,
  runLLM,
  type LlmCallRow,
  type LlmPlan,
  type ProviderConfig,
  type ProviderKey,
} from '../src/llm/index';

const env = process.env;

const SmokeSchema = z.object({
  ok: z.boolean(),
  word: z.string().min(1).max(40),
});

interface Case {
  provider: ProviderKey;
  available: boolean;
  missing: string;
  config: () => ProviderConfig;
  plan: LlmPlan;
  country: string;
}

const cases: Case[] = [
  {
    provider: 'gemini',
    available: Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY),
    missing: 'GOOGLE_GENERATIVE_AI_API_KEY',
    config: () => ({ gemini: { apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY ?? '', model: env.GEMINI_MODEL } }),
    plan: 'free',
    country: 'US',
  },
  {
    provider: 'workers',
    available: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN),
    missing: 'CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (no AI binding outside a Worker)',
    config: () => ({
      workers: {
        accountId: env.CLOUDFLARE_ACCOUNT_ID ?? '',
        apiToken: env.CLOUDFLARE_API_TOKEN ?? '',
        model: env.WORKERS_MODEL,
      },
    }),
    plan: 'free',
    country: 'DE', // EEA route → workers only
  },
  {
    provider: 'claude',
    available: Boolean(env.ANTHROPIC_API_KEY),
    missing: 'ANTHROPIC_API_KEY',
    config: () => ({ claude: { apiKey: env.ANTHROPIC_API_KEY ?? '', model: env.CLAUDE_MODEL }, claudeEnabled: true }),
    plan: 'sprint30',
    country: 'US',
  },
];

async function main(): Promise<void> {
  let failures = 0;
  let ran = 0;
  for (const c of cases) {
    if (!c.available) {
      console.log(`[skip] ${c.provider}: set ${c.missing}`);
      continue;
    }
    ran++;
    const rows: LlmCallRow[] = [];
    try {
      const res = await runLLM({
        task: 'smoke',
        system: 'You are a test endpoint. Reply with JSON only.',
        prompt: 'Return {"ok": true, "word": "<one random English word>"}.',
        schema: SmokeSchema,
        temperature: 0,
        maxOutputTokens: 200,
        plan: c.plan,
        country: c.country,
        promptVersion: 'smoke@1',
        providers: c.config(),
        sink: { record: (row) => void rows.push(row) },
      });
      console.log(
        `[ok]   ${res.provider} model=${res.model} latency=${res.latencyMs}ms ` +
          `tokens in=${res.usage.inputTokens ?? '?'} out=${res.usage.outputTokens ?? '?'} ` +
          `cost=$${res.costUsd} retries=${res.retries} word=${JSON.stringify(res.object.word)}`,
      );
    } catch (e) {
      failures++;
      const code = e instanceof LlmError ? e.code : 'unexpected';
      const cause = e instanceof Error && e.cause instanceof Error ? ` cause=${e.cause.message}` : '';
      console.log(`[fail] ${c.provider}: ${code}: ${e instanceof Error ? e.message : String(e)}${cause}`);
      for (const r of rows) console.log(`       attempt ${r.retries}: ${r.provider}/${r.model} ${r.error_code ?? 'ok'} ${r.latency_ms}ms`);
    }
  }
  if (ran === 0) console.log('No provider credentials found in env: nothing to smoke-test (this is fine).');
  process.exitCode = failures > 0 ? 1 : 0;
}

void main();
