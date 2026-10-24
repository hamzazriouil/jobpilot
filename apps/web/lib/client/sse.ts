// Incremental Server-Sent Events parser (WHATWG "event stream interpretation"), pure and framework-free.
// Feed it decoded text chunks as they arrive; it returns the events completed by each chunk.
// Chunk boundaries can fall anywhere: inside a field, between `\r` and `\n`, or mid-event.
//
// Wire format used by /api/analyze and /api/draft: packages/core/src/schemas/stream.ts.

export interface SseMessage {
  /** The `event:` field, or 'message' when the event has none. */
  event: string;
  /** All `data:` lines joined with '\n'. */
  data: string;
}

export interface SseParser {
  /** Parses one decoded chunk and returns every event it completed (often zero or one). */
  push(chunk: string): SseMessage[];
  /**
   * Call once when the stream ends. Unlike the spec (which drops an unterminated event), this
   * dispatches a final event that is missing its blank line, so a server that forgets the
   * trailing `\n\n` doesn't lose its `result`.
   */
  flush(): SseMessage[];
}

export function createSseParser(): SseParser {
  let buffer = '';
  let atStreamStart = true;
  let eventName = '';
  let dataLines: string[] = [];

  function dispatch(out: SseMessage[]) {
    if (dataLines.length > 0) out.push({ event: eventName || 'message', data: dataLines.join('\n') });
    eventName = '';
    dataLines = [];
  }

  function processLine(line: string, out: SseMessage[]) {
    if (line === '') return dispatch(out);
    if (line.startsWith(':')) return; // comment / keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value;
    else if (field === 'data') dataLines.push(value);
    // `id` and `retry` are ignored: these streams are one-shot POSTs, never reconnected.
  }

  return {
    push(chunk) {
      if (atStreamStart && chunk.length > 0) {
        if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
        atStreamStart = false;
      }
      buffer += chunk;
      const out: SseMessage[] = [];
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch !== '\n' && ch !== '\r') continue;
        // A trailing '\r' might be the first half of '\r\n': wait for the next chunk to decide.
        if (ch === '\r' && i === buffer.length - 1) break;
        processLine(buffer.slice(start, i), out);
        if (ch === '\r' && buffer[i + 1] === '\n') i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
      return out;
    },
    flush() {
      const out: SseMessage[] = [];
      if (buffer.length > 0) {
        processLine(buffer.replace(/\r$/, ''), out);
        buffer = '';
      }
      dispatch(out);
      return out;
    },
  };
}

/** Parses a complete SSE body in one go (tests, non-streaming fallbacks). */
export function parseSseText(text: string): SseMessage[] {
  const parser = createSseParser();
  return [...parser.push(text), ...parser.flush()];
}
