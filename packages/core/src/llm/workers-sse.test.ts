import { describe, expect, it } from 'vitest';
import { dedupeWorkersSseLine, dedupeWorkersSseStream, dedupingBinding } from './workers-sse';

const dup = (t: string) => `data: ${JSON.stringify({ response: t, choices: [{ index: 0, delta: { content: t } }] })}`;

async function pipe(chunks: string[]): Promise<string> {
  const enc = new TextEncoder();
  const src = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(src.pipeThrough(dedupeWorkersSseStream())).text();
}

describe('dedupeWorkersSseLine', () => {
  it('drops delta.content when it repeats `response`', () => {
    const out = JSON.parse(dedupeWorkersSseLine(dup('"job"')).slice(6));
    expect(out).toEqual({ response: '"job"', choices: [{ index: 0, delta: {} }] });
  });

  it('leaves other lines alone', () => {
    for (const line of [
      'data: [DONE]',
      'event: x',
      '',
      `data: ${JSON.stringify({ response: '', choices: [{ delta: { content: 'a' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'a' } }] })}`,
      `data: ${JSON.stringify({ response: 'a' })}`,
      `data: ${JSON.stringify({ response: 'a', choices: [{ delta: { content: 'b' } }] })}`,
      'data: {not json',
    ]) {
      expect(dedupeWorkersSseLine(line)).toBe(line);
    }
  });
});

describe('dedupeWorkersSseStream', () => {
  it('handles lines split across chunks and keeps the stream otherwise intact', async () => {
    const body = `${dup('{"a"')}\n\n${dup(': 1}')}\n\ndata: [DONE]\n\n`;
    const out = await pipe([body.slice(0, 17), body.slice(17, 60), body.slice(60)]);
    const texts = out
      .split('\n')
      .filter((l) => l.startsWith('data: {'))
      .map((l) => JSON.parse(l.slice(6)))
      .map((c: { response: string; choices: Array<{ delta: { content?: string } }> }) => c.response + (c.choices[0]!.delta.content ?? ''));
    expect(texts.join('')).toBe('{"a": 1}');
    expect(out.endsWith('data: [DONE]\n\n')).toBe(true);
  });
});

describe('dedupingBinding', () => {
  it('pipes streamed results through the fix and passes other results through', async () => {
    const enc = new TextEncoder();
    const binding = {
      async run(_model: string, opts: { stream?: boolean }) {
        if (!opts.stream) return { response: 'x' };
        return new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode(`${dup('hi')}\n\n`));
            c.close();
          },
        });
      },
    };
    const wrapped = dedupingBinding(binding) as unknown as typeof binding;
    expect(await wrapped.run('m', {})).toEqual({ response: 'x' });
    const text = await new Response((await wrapped.run('m', { stream: true })) as ReadableStream).text();
    expect(text).not.toContain('"content"');
  });
});
