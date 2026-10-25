import type { WorkersAiBinding } from '@jobpilot/core/llm';

// Worker bindings, vars and secrets (docs/09-PHASE1-CONTRACT.md §5, Architecture §15).
// The CLI builds the same shape from apps/web/.dev.vars (see cli.ts).

export interface Env {
  AI?: WorkersAiBinding;
  APP_URL: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Optional: only for the 'unclear' location fallback. */
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  /** Optional: Himalayas API key (higher rate limit than the shared public allowance). */
  HIMALAYAS_API_KEY?: string;
  INGEST_MAX_PAGES?: string;
  LLM_FALLBACK_CAP?: string;
}

/** Defaults sized for one cron run (Workers subrequest and CPU limits): see docs/10-SOURCES.md. */
export const DEFAULT_MAX_PAGES = 10;
export const DEFAULT_LLM_FALLBACK_CAP = 10;

export function intVar(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** `ApplyVerdictBot/0.1 (+https://…)`: every outbound request to a job source carries it. */
export function userAgent(appUrl: string): string {
  return `ApplyVerdictBot/0.1 (+${appUrl})`;
}

// Minimal Workers runtime types (see tsconfig.json for why they're not imported).
export interface ScheduledControllerLike {
  readonly cron: string;
  readonly scheduledTime: number;
}
export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}
