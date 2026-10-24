import type { SseEventName } from '@jobpilot/core/schemas';

// SSE encoder for /api/analyze and /api/draft. Wire format: packages/core/src/schemas/stream.ts
// (`event: <name>\ndata: <one-line JSON>\n\n`). JSON.stringify escapes newlines, so `data` is
// always a single line.

const encoder = new TextEncoder();

export function encodeSseEvent(event: SseEventName, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const SSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store, no-transform',
  'x-accel-buffering': 'no',
  'x-content-type-options': 'nosniff',
});

/** Returns false once the client has gone away (further sends are dropped). */
export type SseSend = (event: SseEventName, data: unknown) => boolean;

/**
 * Streams the events written by `produce`, then closes. `produce` must catch its own errors and
 * send an `error` event; anything it throws is logged and turned into a generic `error` event.
 */
export function sseResponse(produce: (send: SseSend) => Promise<void>): Response {
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send: SseSend = (event, data) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(event, data)));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };
      void produce(send)
        .catch((err: unknown) => {
          console.error(JSON.stringify({ type: 'sse_producer_error', message: String(err) }));
          send('error', { error: { code: 'internal', message: 'Something went wrong. Please try again.' } });
        })
        .finally(() => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed or cancelled
          }
        });
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
