// DEV ONLY. Helpers for app/api/dev-mock/*: replay fixtures as SSE so the UI can be built and
// tested without an LLM. Every route answers 404 in production (see `devOnly`).
// Frames are deliberately split at random points to exercise the client parser's chunk handling.
import type { ApiErrorCode } from '@jobpilot/core/schemas';
import { DEV_MOCK_SCENARIOS, type DevMockScenario } from '@/lib/client/endpoints';

/** Returns a 404 in production builds; null in development. */
export function devOnly(): Response | null {
  return process.env.NODE_ENV === 'production' ? new Response('Not found', { status: 404 }) : null;
}

export function scenarioFrom(req: Request): DevMockScenario {
  const value = new URL(req.url).searchParams.get('scenario') ?? 'ok';
  return (DEV_MOCK_SCENARIOS as readonly string[]).includes(value) ? (value as DevMockScenario) : 'ok';
}

export function jsonError(code: ApiErrorCode, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status, headers: { 'cache-control': 'no-store' } });
}

export interface MockFrame {
  event: 'partial' | 'result' | 'error';
  data: unknown;
  /** Wait before sending this frame. */
  delayMs: number;
}

export function sseReplay(frames: MockFrame[], signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const frame of frames) {
          await sleep(frame.delayMs, signal);
          const text = `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
          const cut = 1 + Math.floor(Math.random() * (text.length - 1));
          controller.enqueue(encoder.encode(text.slice(0, cut)));
          await sleep(5, signal);
          controller.enqueue(encoder.encode(text.slice(cut)));
        }
        controller.close();
      } catch {
        // Client went away (abort): stop quietly.
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-dev-mock': '1',
    },
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Grows `text` word by word: returns the prefixes after every `step` words (last = full text). */
export function wordPrefixes(text: string, step: number): string[] {
  const parts = text.split(/(?<=\s)/); // keep the whitespace attached to each word
  const out: string[] = [];
  for (let i = step; i < parts.length; i += step) out.push(parts.slice(0, i).join(''));
  out.push(text);
  return out;
}
