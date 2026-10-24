import type { WorkersAiBinding } from './providers';

// Workaround for workers-ai-provider 4.0.1 (deprecated, last release) + the current Workers AI
// streaming format. Each SSE chunk now carries the token twice: in the native `response` field AND
// in the OpenAI-style `choices[0].delta.content`. The provider emits a text-delta for both, so every
// streamed token is doubled ("job  "job": {") and the JSON is unparseable. Non-stream calls are not
// affected. This transform removes the duplicate `delta.content` before the provider parses the
// chunk; everything else (finish_reason, tool calls, usage) passes through untouched.
// Remove once the provider is replaced (Cloudflare points to `agents/models/ai-sdk`).

/** Rewrites one SSE line; returns it unchanged unless it is a duplicated-text data line. */
export function dedupeWorkersSseLine(line: string): string {
  if (!line.startsWith('data:')) return line;
  const payload = line.slice(5).trim();
  if (!payload.startsWith('{')) return line; // e.g. `data: [DONE]`
  let chunk: { response?: unknown; choices?: Array<{ delta?: { content?: unknown } }> };
  try {
    chunk = JSON.parse(payload);
  } catch {
    return line;
  }
  if (typeof chunk.response !== 'string' || chunk.response === '' || !Array.isArray(chunk.choices)) return line;
  let changed = false;
  for (const choice of chunk.choices) {
    if (choice?.delta && choice.delta.content === chunk.response) {
      delete choice.delta.content;
      changed = true;
    }
  }
  return changed ? `data: ${JSON.stringify(chunk)}` : line;
}

/** Line-buffered byte transform applying dedupeWorkersSseLine to an SSE stream. */
export function dedupeWorkersSseStream(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  return new TransformStream({
    transform(bytes, controller) {
      buffer += decoder.decode(bytes, { stream: true });
      const lastNewline = buffer.lastIndexOf('\n');
      if (lastNewline < 0) return;
      const complete = buffer.slice(0, lastNewline + 1);
      buffer = buffer.slice(lastNewline + 1);
      controller.enqueue(encoder.encode(complete.split('\n').map(dedupeWorkersSseLine).join('\n')));
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) controller.enqueue(encoder.encode(dedupeWorkersSseLine(buffer)));
    },
  });
}

/** fetch wrapper for REST mode: dedupes `text/event-stream` responses. */
export function dedupingFetch(base: typeof fetch = fetch): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const res = await base(input, init);
    if (!res.body || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) return res;
    return new Response(res.body.pipeThrough(dedupeWorkersSseStream()), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  }) as typeof fetch;
}

/** Binding wrapper: `env.AI.run(..., { stream: true })` returns the same SSE bytes as a ReadableStream. */
export function dedupingBinding(binding: WorkersAiBinding): WorkersAiBinding {
  const b = binding as unknown as { run: (...args: unknown[]) => Promise<unknown> };
  const wrapped = Object.create(binding) as { run: (...args: unknown[]) => Promise<unknown> };
  wrapped.run = async (...args: unknown[]) => {
    const out = await b.run.apply(binding, args);
    return out instanceof ReadableStream ? out.pipeThrough(dedupeWorkersSseStream()) : out;
  };
  return wrapped as unknown as WorkersAiBinding;
}
