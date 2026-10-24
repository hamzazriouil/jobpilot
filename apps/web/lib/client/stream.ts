// POST + SSE client for /api/analyze and /api/draft (wire format: packages/core/src/schemas/stream.ts).
// `partial` frames go to `onPartial` as raw JSON (callers sanitize them); the `result` frame is
// validated against its schema before it is returned, so the UI only ever renders a checked result.
import { ApiError, type ApiErrorCode } from '@jobpilot/core/schemas';
import { createSseParser, type SseMessage } from './sse';

/** The part of a Zod schema this client needs (apps/web doesn't depend on zod directly). */
export interface ResultSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** Server error codes plus the failures that only exist on the client. */
export type StreamErrorCode = ApiErrorCode | 'network' | 'aborted' | 'incomplete';

export class StreamError extends Error {
  readonly code: StreamErrorCode;
  /** HTTP status when the server answered with a plain JSON error before streaming. */
  readonly status: number | undefined;

  constructor(code: StreamErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'StreamError';
    this.code = code;
    this.status = status;
  }
}

export interface PostSseOptions<TResult> {
  /** Validates the `result` frame. A result that fails validation is reported as `internal`. */
  resultSchema: ResultSchema<TResult>;
  /** Called with each parsed `partial` payload (untrusted, deep-partial JSON). */
  onPartial?: (partial: unknown) => void;
  signal?: AbortSignal;
}

/** POSTs `body` as JSON and consumes the SSE response. Resolves with the validated result. */
export async function postSse<TResult>(url: string, body: unknown, options: PostSseOptions<TResult>): Promise<TResult> {
  const { resultSchema, onPartial, signal } = options;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (err) {
    throw toStreamError(err, signal);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream') || !res.body) {
    throw await errorFromResponse(res);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = createSseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const messages = done ? parser.flush() : parser.push(value);
      for (const message of messages) {
        const outcome = handleMessage(message, resultSchema, onPartial);
        if (outcome) {
          // The result (or error) is final: stop reading so the connection can close.
          void reader.cancel().catch(() => {});
          if (outcome.kind === 'error') throw outcome.error;
          return outcome.result;
        }
      }
      if (done) break;
    }
  } catch (err) {
    throw toStreamError(err, signal);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released or errored: nothing to clean up
    }
  }
  throw new StreamError('incomplete', 'The stream ended before the result arrived.');
}

type Outcome<TResult> = { kind: 'result'; result: TResult } | { kind: 'error'; error: StreamError } | null;

function handleMessage<TResult>(
  message: SseMessage,
  resultSchema: ResultSchema<TResult>,
  onPartial: ((partial: unknown) => void) | undefined,
): Outcome<TResult> {
  const json = safeJsonParse(message.data);
  if (message.event === 'partial') {
    // A malformed partial is skipped: the final result is what counts.
    if (json !== undefined) onPartial?.(json);
    return null;
  }
  if (message.event === 'result') {
    const parsed = resultSchema.safeParse(json);
    if (parsed.success) return { kind: 'result', result: parsed.data };
    return { kind: 'error', error: new StreamError('internal', 'The server sent a result in an unexpected shape.') };
  }
  if (message.event === 'error') {
    const parsed = ApiError.safeParse(json);
    const error = parsed.success
      ? new StreamError(parsed.data.error.code, parsed.data.error.message)
      : new StreamError('internal', 'The server reported an error.');
    return { kind: 'error', error };
  }
  return null; // unknown event names are ignored
}

async function errorFromResponse(res: Response): Promise<StreamError> {
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const parsed = ApiError.safeParse(json);
  if (parsed.success) return new StreamError(parsed.data.error.code, parsed.data.error.message, res.status);
  if (res.status === 429) return new StreamError('quota_exceeded', 'Too many requests.', res.status);
  if (res.status === 503) return new StreamError('busy', 'Service busy.', res.status);
  return new StreamError('internal', `Unexpected response (HTTP ${res.status}).`, res.status);
}

function toStreamError(err: unknown, signal: AbortSignal | undefined): StreamError {
  if (err instanceof StreamError) return err;
  if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
    return new StreamError('aborted', 'Stopped.');
  }
  return new StreamError('network', err instanceof Error ? err.message : 'Network error.');
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
