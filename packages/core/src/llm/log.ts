import type { ProviderKey } from './providers';

/**
 * One row per provider attempt, matching the `llm_calls` columns exactly (02-DATABASE §4;
 * `id` and `created_at` are DB defaults). Never contains prompt or response text.
 */
export interface LlmCallRow {
  /** analyze | draft | parse | classify_location | follow_up | ... (the `task` passed to runLLM) */
  feature: string;
  provider: ProviderKey;
  model: string;
  prompt_version: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  cost_usd: number;
  /** true/false for structured calls; null for plain-text calls or when no output was produced. */
  schema_valid: boolean | null;
  /** 0-based index of this attempt within one runLLM call (fallbacks and repair retries both count). */
  retries: number;
  /** null on success, otherwise e.g. `http_429`, `http_503`, `timeout`, `network`, `schema_invalid`. */
  error_code: string | null;
  user_id: string | null;
}

export interface LlmCallSink {
  /**
   * Called once per attempt. runLLM does NOT await the result (logging must never slow down or
   * break the user's request) but does swallow rejections. A sink doing I/O inside a Worker
   * should hand its promise to `ctx.waitUntil()`.
   */
  record(row: LlmCallRow): void | Promise<void>;
}

export const noopSink: LlmCallSink = {
  record() {},
};

/** Structured JSON to stdout; on Cloudflare this lands in Workers Logs (§12). */
export const consoleSink: LlmCallSink = {
  record(row) {
    console.log(JSON.stringify({ type: 'llm_call', ...row }));
  },
};

/** Calls the sink without ever throwing or blocking. */
export function safeRecord(sink: LlmCallSink, row: LlmCallRow): void {
  try {
    const p = sink.record(row);
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch((err: unknown) => {
        console.error(JSON.stringify({ type: 'llm_sink_error', message: String(err) }));
      });
    }
  } catch (err) {
    console.error(JSON.stringify({ type: 'llm_sink_error', message: String(err) }));
  }
}
