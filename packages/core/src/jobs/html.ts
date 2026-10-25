import { trimToLength } from '../pipeline/text';
import { JOB_DESCRIPTION_MAX } from '../schemas/job';

// HTML job descriptions → plain text (docs/09-PHASE1-CONTRACT.md §3). Regex-based on purpose:
// it runs inside the ingest Worker (CPU-limited, no DOM) and only needs readable text for the LLM,
// the embedding and the UI, never faithful rendering. Output is never rendered as HTML.

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', rsquo: '’', lsquo: '‘', rdquo: '”',
  ldquo: '“', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥',
  cent: '¢', deg: '°', times: '×', divide: '÷', plusmn: '±', shy: '', zwj: '', zwnj: '',
  eacute: 'é', egrave: 'è', ecirc: 'ê', aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', ouml: 'ö',
  uuml: 'ü', szlig: 'ß', ccedil: 'ç', ntilde: 'ñ', oacute: 'ó', iacute: 'í', uacute: 'ú',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Invalid or control code points are dropped rather than producing broken text.
      if (!Number.isFinite(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return code === 9 || code === 10 ? String.fromCharCode(code) : '';
      }
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Plain text from HTML job descriptions (no tags, entities decoded, capped at JOB_DESCRIPTION_MAX). */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|section|article|h[1-6]|ul|ol|tr|table|blockquote|pre|header|footer)\s*>/gi, '\n')
    .replace(/<(p|div|h[1-6]|ul|ol|tr|table|blockquote|pre)\b[^>]*>/gi, '\n')
    .replace(/<\/?(td|th)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/<[^>]*$/, ''); // a tag cut off at the end of the input

  return trimToLength(
    decodeEntities(text)
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​﻿]/g, '')
      .replace(/[ \t ]+/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .replace(/^-$/gm, '') // empty list items
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    JOB_DESCRIPTION_MAX,
  );
}
