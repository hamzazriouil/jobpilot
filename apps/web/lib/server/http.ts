import type { z } from 'zod';
import { LlmError } from '@jobpilot/core/llm';
import type { ApiError, ApiErrorCode } from '@jobpilot/core/schemas';

// JSON error responses and body parsing shared by the API routes (docs/05-ARCHITECTURE.md §8, §14).

/** cv (20k chars) + job (15k chars), up to 4 bytes each in UTF-8, plus JSON overhead. */
export const MAX_BODY_BYTES = 160_000;

const NO_STORE = { 'cache-control': 'no-store' };

export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } };
}

export function apiErrorResponse(code: ApiErrorCode, message: string, status: number): Response {
  return Response.json(apiError(code, message), { status, headers: NO_STORE });
}

export function badInput(message: string, status = 400): Response {
  return apiErrorResponse('bad_input', message, status);
}

/** "cvText: Too small: expected string to have >=200 characters" (first issue only). */
export function describeZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request body.';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Reads a JSON body with a size cap. Accepts `application/json` and `text/plain` (JSON text) only.
 * Returns the parsed value or a ready-made 4xx response.
 */
export async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('application/json') && !type.startsWith('text/plain')) {
    return { ok: false, response: badInput('Content-Type must be application/json.', 415) };
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return { ok: false, response: badInput('Request body is too large.', 413) };
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: badInput('Could not read the request body.') };
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, response: badInput('Request body is too large.', 413) };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: badInput('Request body is not valid JSON.') };
  }
}

export const BUSY_MESSAGE = 'High demand right now. Please try again in a minute.';
export const INTERNAL_MESSAGE = 'Something went wrong on our side. Please try again.';

/** Maps a runLLM failure to the public error shape. Details go to the logs, never to the client. */
export function llmFailure(err: unknown): { body: ApiError; status: number } {
  if (LlmError.isLlmError(err) && (err.code === 'busy' || err.code === 'timeout')) {
    return { body: apiError('busy', BUSY_MESSAGE), status: 503 };
  }
  return { body: apiError('internal', INTERNAL_MESSAGE), status: 500 };
}

/** Structured log line for Workers Logs (§12). Never pass CV or job text here. */
export function logError(type: string, err: unknown, extra: Record<string, unknown> = {}): void {
  const base: Record<string, unknown> = { type, ...extra, message: err instanceof Error ? err.message : String(err) };
  if (LlmError.isLlmError(err)) {
    base.code = err.code;
    base.provider = err.provider;
    base.attempts = err.attempts;
    // Provider error name/status/message only (APICallError keeps request bodies in separate fields).
    const cause = err.cause as { name?: unknown; message?: unknown; statusCode?: unknown } | undefined;
    if (cause) {
      base.cause = {
        name: String(cause.name ?? ''),
        status: typeof cause.statusCode === 'number' ? cause.statusCode : undefined,
        message: String(cause.message ?? '').slice(0, 300),
      };
    }
  }
  console.error(JSON.stringify(base));
}
