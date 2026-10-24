import { describe, expect, it } from 'vitest';
import { parseSseText } from '../client/sse';
import { encodeSseEvent, sseResponse } from './sse';

describe('encodeSseEvent', () => {
  it('writes one event line and one single-line data field', () => {
    const frame = encodeSseEvent('partial', { coverLetter: 'Hello,\n\nline two "quoted"' });
    expect(frame).toBe('event: partial\ndata: {"coverLetter":"Hello,\\n\\nline two \\"quoted\\""}\n\n');
    expect(frame.split('\n')).toHaveLength(4);
  });

  it('round-trips through the client parser', () => {
    const data = { result: { score: 77, text: 'a\r\nb c' }, analysisToken: 'x.y' };
    const [msg] = parseSseText(encodeSseEvent('result', data));
    expect(msg?.event).toBe('result');
    expect(JSON.parse(msg!.data)).toEqual(data);
  });
});

describe('sseResponse', () => {
  it('streams events in order with SSE headers, then closes', async () => {
    const res = sseResponse(async (send) => {
      send('partial', { a: 1 });
      await new Promise((r) => setTimeout(r, 5));
      send('partial', { a: 2 });
      send('result', { done: true });
    });
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const msgs = parseSseText(await res.text());
    expect(msgs.map((m) => [m.event, JSON.parse(m.data)])).toEqual([
      ['partial', { a: 1 }],
      ['partial', { a: 2 }],
      ['result', { done: true }],
    ]);
  });

  it('turns an unexpected producer error into one error event', async () => {
    const res = sseResponse(async (send) => {
      send('partial', { a: 1 });
      throw new Error('boom');
    });
    const msgs = parseSseText(await res.text());
    expect(msgs.map((m) => m.event)).toEqual(['partial', 'error']);
    expect(JSON.parse(msgs[1]!.data)).toEqual({ error: { code: 'internal', message: expect.any(String) } });
  });

  it('reports a cancelled client to the producer', async () => {
    let afterCancel: boolean | undefined;
    let resume!: () => void;
    const gate = new Promise<void>((r) => (resume = r));
    const res = sseResponse(async (send) => {
      send('partial', { a: 1 });
      await gate;
      afterCancel = send('partial', { a: 2 });
    });
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    resume();
    await new Promise((r) => setTimeout(r, 5));
    expect(afterCancel).toBe(false);
  });
});
