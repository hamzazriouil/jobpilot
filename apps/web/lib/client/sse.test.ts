import { describe, expect, it } from 'vitest';
import { createSseParser, parseSseText, type SseMessage } from './sse';

/** Feeds `text` to a fresh parser in pieces of `size` characters and collects every event. */
function parseInPieces(text: string, size: number): SseMessage[] {
  const parser = createSseParser();
  const out: SseMessage[] = [];
  for (let i = 0; i < text.length; i += size) out.push(...parser.push(text.slice(i, i + size)));
  out.push(...parser.flush());
  return out;
}

const STREAM =
  'event: partial\ndata: {"job":{"title":"AI Engineer"}}\n\n' +
  'event: partial\ndata: {"eligibility":{"verdict":"eligible"}}\n\n' +
  'event: result\ndata: {"analysisToken":"t.k","result":{"score":72}}\n\n';

const EXPECTED: SseMessage[] = [
  { event: 'partial', data: '{"job":{"title":"AI Engineer"}}' },
  { event: 'partial', data: '{"eligibility":{"verdict":"eligible"}}' },
  { event: 'result', data: '{"analysisToken":"t.k","result":{"score":72}}' },
];

describe('createSseParser', () => {
  it('parses a whole stream in one chunk', () => {
    expect(parseSseText(STREAM)).toEqual(EXPECTED);
  });

  it('gives the same events for every possible chunk size', () => {
    for (let size = 1; size <= STREAM.length; size++) {
      expect(parseInPieces(STREAM, size)).toEqual(EXPECTED);
    }
  });

  it('only emits an event once its blank line arrives', () => {
    const parser = createSseParser();
    expect(parser.push('event: partial\ndata: {"a":1}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'partial', data: '{"a":1}' }]);
  });

  it('handles CRLF and lone CR line endings, including CRLF split across chunks', () => {
    const crlf = STREAM.replace(/\n/g, '\r\n');
    const cr = STREAM.replace(/\n/g, '\r');
    expect(parseSseText(crlf)).toEqual(EXPECTED);
    expect(parseSseText(cr)).toEqual(EXPECTED);
    for (let size = 1; size <= 12; size++) {
      expect(parseInPieces(crlf, size)).toEqual(EXPECTED);
      expect(parseInPieces(cr, size)).toEqual(EXPECTED);
    }
  });

  it('does not treat a CR at the end of a chunk followed by LF as two line breaks', () => {
    const parser = createSseParser();
    expect(parser.push('data: x\r')).toEqual([]);
    // If '\r' + '\n' were read as two line endings, this would already dispatch here.
    expect(parser.push('\n')).toEqual([]);
    expect(parser.push('\r\n')).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('joins multiple data lines with a newline', () => {
    expect(parseSseText('event: partial\ndata: line one\ndata: line two\n\n')).toEqual([
      { event: 'partial', data: 'line one\nline two' },
    ]);
  });

  it('ignores comments, id and retry fields, and unknown fields', () => {
    const text = ': keep-alive\nid: 7\nretry: 1000\nfoo: bar\nevent: result\ndata: {}\n\n';
    expect(parseSseText(text)).toEqual([{ event: 'result', data: '{}' }]);
  });

  it('strips exactly one space after the colon', () => {
    expect(parseSseText('data:no-space\n\n')).toEqual([{ event: 'message', data: 'no-space' }]);
    expect(parseSseText('data:  two-spaces\n\n')).toEqual([{ event: 'message', data: ' two-spaces' }]);
  });

  it('treats a field line without a colon as a field with an empty value', () => {
    expect(parseSseText('data\n\n')).toEqual([{ event: 'message', data: '' }]);
  });

  it('defaults the event name to "message" and resets it between events', () => {
    expect(parseSseText('event: partial\ndata: 1\n\ndata: 2\n\n')).toEqual([
      { event: 'partial', data: '1' },
      { event: 'message', data: '2' },
    ]);
  });

  it('skips events that carry no data', () => {
    expect(parseSseText('event: partial\n\nevent: result\ndata: {}\n\n')).toEqual([
      { event: 'result', data: '{}' },
    ]);
  });

  it('strips a leading byte-order mark', () => {
    expect(parseSseText('﻿event: result\ndata: {}\n\n')).toEqual([{ event: 'result', data: '{}' }]);
  });

  it('keeps colons and unicode inside data intact', () => {
    const data = '{"quote":"Note: “remote” — EMEA only","url":"https://x.example.com"}';
    expect(parseInPieces(`event: partial\ndata: ${data}\n\n`, 3)).toEqual([{ event: 'partial', data }]);
  });

  it('dispatches an unterminated final event on flush', () => {
    const parser = createSseParser();
    expect(parser.push('event: result\ndata: {"ok":true}')).toEqual([]);
    expect(parser.flush()).toEqual([{ event: 'result', data: '{"ok":true}' }]);
  });

  it('flush on an empty or fully consumed stream emits nothing', () => {
    const parser = createSseParser();
    expect(parser.flush()).toEqual([]);
    const done = createSseParser();
    done.push(STREAM);
    expect(done.flush()).toEqual([]);
  });
});
