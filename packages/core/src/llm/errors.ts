import type { ProviderKey } from './providers';

/**
 * Codes surfaced to callers of `runLLM`.
 * - `busy`           every provider in the route failed with a retryable error (429 / 5xx / network)
 * - `timeout`        every provider in the route timed out
 * - `schema_invalid` the output failed zod validation, including after the one repair retry
 * - `bad_config`     no provider in the route is configured (missing key / binding), or auth was rejected (401/403)
 * - `provider_error` a non-retryable provider error (e.g. 400, content filter)
 */
export type LlmErrorCode = 'busy' | 'schema_invalid' | 'timeout' | 'bad_config' | 'provider_error';

export interface LlmAttemptSummary {
  provider: ProviderKey;
  model: string;
  /** Fine-grained per-attempt code, same value as the `llm_calls.error_code` column. */
  errorCode: string | null;
}

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  /** Provider of the last attempt, if any attempt was made. */
  readonly provider: ProviderKey | undefined;
  readonly attempts: readonly LlmAttemptSummary[];

  constructor(
    code: LlmErrorCode,
    message: string,
    opts: { provider?: ProviderKey; attempts?: LlmAttemptSummary[]; cause?: unknown } = {},
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'LlmError';
    this.code = code;
    this.provider = opts.provider;
    this.attempts = opts.attempts ?? [];
  }

  static isLlmError(e: unknown): e is LlmError {
    return e instanceof LlmError;
  }
}

/** Internal marker thrown when an attempt exceeds its time budget. */
export class LlmTimeoutError extends Error {
  constructor(ms: number) {
    super(`LLM call timed out after ${ms}ms`);
    this.name = 'LlmTimeoutError';
  }
}
