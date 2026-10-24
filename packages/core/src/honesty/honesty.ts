import type { DraftsLLM, HonestyFlag } from '../schemas';
import { prepareSource, quoteFoundIn, type PreparedSource } from '../scoring/evidence';

// Honesty check for drafts, Architecture §5.2 step 3 (v0, code only; the LLM judge is Phase 3).
// Pure functions. A flag means "this fact is not in the CV or the job post": the UI shows it as a
// warning so the user checks it before sending. It is not proof of a lie, so we aim for few false
// positives over catching everything.
//
// What is checked in each draft (cover letter, cold DM, each improved CV bullet):
// 1. Links and emails: must appear (case-insensitive, protocol/www/trailing slash ignored) in a source.
// 2. Numbers and years: "38,000", "38k", "2025", "40%", "12-person". Thousands separators are
//    ignored and a `k` suffix is expanded, so "38k" matches "38,000". Digits glued to letters
//    ("D1", "ES2022") are treated as names, not numbers.
// 3. Proper nouns: capitalised words mid-sentence, and words with inner capitals or digits
//    ("TypeScript", "iOS", "D1") anywhere. Matched on token boundaries, like the evidence check,
//    with a possessive ('s) and a plural (s) tolerance.
// Not flagged: sentence-initial words with ordinary capitalisation ("Built", "Recently"), months,
// weekdays, greetings and sign-off words, "I", and a few generic acronyms (AI, API, LLM, CV, UI).
// Known misses (accepted for v0): a made-up name at the very start of a sentence, numbers written
// as words ("four months"), and facts that are wrong but use words that exist in the sources.

export interface HonestyContext {
  cvText: string;
  /** The job post. Optional: without it, every company / product name from the post is flagged. */
  jobText?: string | null;
}

const IGNORED_WORDS = new Set([
  // calendar
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov',
  'dec', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  // pronoun
  'i', "i'm", 'i’m', "i've", 'i’ve', "i'd", 'i’d', "i'll", 'i’ll',
  // greetings, salutations, sign-offs
  'hi', 'hello', 'hey', 'dear', 'thanks', 'thank', 'best', 'regards', 'cheers', 'sincerely', 'warmly',
  'kind', 'team', 'hiring', 'manager', 'sir', 'madam', 'mr', 'mrs', 'ms', 'dr',
  // generic acronyms that are not claims about the candidate
  'ai', 'api', 'apis', 'llm', 'llms', 'cv', 'ui', 'ux', 'ok', 'ps', 'am', 'pm', 'ceo', 'cto', 'faq',
]);

// Links: explicit URLs, emails and bare domains on common TLDs (not ".js", so "Next.js" is a name).
const LINK_RE =
  /\bhttps?:\/\/[^\s<>"'()[\]]+|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|dev|ai|app|org|net|co|me|xyz)\b(?:\/[^\s<>"'()[\]]*)?/giu;
// A number not glued to a preceding letter/digit, with an optional k/K suffix (38k).
const NUMBER_RE = /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*(?:[kK](?![\p{L}\p{N}]))?/gu;
// A word: letters/digits with inner . ' ’ + # allowed (Next.js, C++, C#, Quillstack's). Hyphens split words.
const WORD_RE = /[\p{L}\p{N}](?:[\p{L}\p{N}.'’+#]*[\p{L}\p{N}+#])?/gu;

/** Sources prepared once per request. */
export interface HonestySources {
  prepared: PreparedSource;
  numbers: ReadonlySet<string>;
  /** Lowercased source text with protocols and `www.` removed, for link matching. */
  linkText: string;
}

export function prepareHonestySources(ctx: HonestyContext): HonestySources {
  const text = [ctx.cvText, ctx.jobText ?? ''].join('\n');
  const numbers = new Set<string>();
  for (const m of text.matchAll(NUMBER_RE)) for (const n of numberForms(m[0])) numbers.add(n);
  return { prepared: prepareSource(text), numbers, linkText: normalizeLink(text) };
}

function normalizeLink(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/(^|[^\w.-])www\./g, '$1');
}

function cleanLink(link: string): string {
  return normalizeLink(link).replace(/[.,;:!?]+$/u, '').replace(/\/+$/u, '');
}

/** Equivalent spellings of one number: "38,000" → ["38000"], "38k" → ["38k", "38000"]. */
export function numberForms(raw: string): string[] {
  let s = raw;
  let k = false;
  if (/[kK]$/u.test(s)) {
    k = true;
    s = s.slice(0, -1);
  }
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(s)) s = s.replace(/,/g, ''); // 38,000 → 38000
  const forms = [s];
  if (k) {
    const n = Number(s.replace(',', '.'));
    if (Number.isFinite(n)) forms.push(String(Math.round(n * 1000)));
  }
  return forms;
}

function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

/** Capitalised, or with an inner capital ("iOS"), or letters glued to digits ("D1"). */
function looksLikeName(word: string): boolean {
  if (!/\p{L}/u.test(word)) return false;
  const first = word[0]!;
  if (isLetter(first) && first === first.toUpperCase() && first !== first.toLowerCase()) return true;
  if (/.\p{Lu}/u.test(word)) return true;
  return /\p{L}/u.test(word) && /\p{N}/u.test(word);
}

/** Only the first letter is a capital ("Built", "Recently"): ordinary sentence-start casing. */
function isPlainCased(word: string): boolean {
  return /^\p{Lu}[\p{Ll}'’]*$/u.test(word);
}

function stripPossessive(word: string): string {
  return word.replace(/['’]s$/u, '');
}

function nameFound(word: string, src: PreparedSource): boolean {
  const w = stripPossessive(word);
  if (quoteFoundIn(w, src)) return true;
  if (/s$/iu.test(w) && w.length > 3 && quoteFoundIn(w.slice(0, -1), src)) return true; // APIs → API
  if (quoteFoundIn(`${w}s`, src)) return true; // API → APIs
  return acronymFound(w, src);
}

/** "RAG" is supported by "retrieval-augmented generation": consecutive source tokens spell its initials. */
function acronymFound(word: string, src: PreparedSource): boolean {
  if (!/^\p{Lu}{2,6}s?$/u.test(word)) return false;
  const letters = word.replace(/s$/u, '').toLowerCase();
  const n = letters.length;
  const t = src.tokens;
  outer: for (let i = 0; i + n <= t.length; i++) {
    for (let k = 0; k < n; k++) if (t[i + k]![0] !== letters[k]) continue outer;
    return true;
  }
  return false;
}

/** Sentence-start verbs ("Scaled Kafka") must not be pulled into a flagged name. */
function looksLikeVerb(word: string): boolean {
  return /(?:ed|ing|ly)$/iu.test(word);
}

interface Word {
  text: string;
  start: number;
  end: number;
  sentenceStart: boolean;
}

function splitWords(text: string): Word[] {
  const words: Word[] = [];
  let prevEnd = -1;
  for (const m of text.matchAll(WORD_RE)) {
    const start = m.index;
    const gap = prevEnd < 0 ? '' : text.slice(prevEnd, start);
    words.push({
      text: m[0],
      start,
      end: start + m[0].length,
      sentenceStart: prevEnd < 0 || /[.!?\n]/u.test(gap),
    });
    prevEnd = start + m[0].length;
  }
  return words;
}

/**
 * Facts in one draft text that appear in none of the sources, in order of appearance,
 * de-duplicated case-insensitively.
 */
export function findUnsupportedFacts(text: string, sources: HonestySources): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const key = s.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(s);
    }
  };

  // 1. Links first, then blank them out so their parts aren't re-checked as names/numbers.
  let rest = text.replace(LINK_RE, (link) => {
    const clean = cleanLink(link);
    const trailing = /[.,;:!?]+$/u.exec(link)?.[0] ?? '';
    if (clean && !sources.linkText.includes(clean)) add(link.slice(0, link.length - trailing.length));
    // Keep trailing punctuation: "...example.com. Open to a chat?" still starts a new sentence.
    return ' '.repeat(link.length - trailing.length) + trailing;
  });

  // 2. Numbers and years.
  for (const m of rest.matchAll(NUMBER_RE)) {
    if (!numberForms(m[0]).some((f) => sources.numbers.has(f))) add(m[0]);
  }
  rest = rest.replace(NUMBER_RE, (n) => ' '.repeat(n.length));

  // 3. Proper nouns, grouped into runs of adjacent names on one line ("Acme Labs").
  const words = splitWords(rest);
  let i = 0;
  while (i < words.length) {
    if (!looksLikeName(words[i]!.text)) {
      i++;
      continue;
    }
    const run: Word[] = [words[i]!];
    let j = i + 1;
    while (j < words.length && looksLikeName(words[j]!.text) && /^[ \t]+$/u.test(rest.slice(run.at(-1)!.end, words[j]!.start))) {
      run.push(words[j]!);
      j++;
    }
    const missing = run.map((w) => {
      if (IGNORED_WORDS.has(stripPossessive(w.text).toLowerCase())) return false;
      if (w.sentenceStart && isPlainCased(w.text)) return null; // unknown: only joins a flagged neighbour
      return !nameFound(w.text, sources.prepared);
    });
    let first = missing.indexOf(true);
    if (first >= 0) {
      const last = missing.lastIndexOf(true);
      // "Acme Labs" at a sentence start: pull the unverified first word into the flag if it's unknown too.
      if (first === 1 && missing[0] === null && !looksLikeVerb(run[0]!.text) && !nameFound(run[0]!.text, sources.prepared)) {
        first = 0;
      }
      add(rest.slice(run[first]!.start, run[last]!.end));
    }
    i = j;
  }
  return out;
}

/** Flags for every draft. `original` CV lines are not checked (they are meant to be CV quotes). */
export function checkHonesty(drafts: DraftsLLM, ctx: HonestyContext | HonestySources): HonestyFlag[] {
  const sources = 'prepared' in ctx ? ctx : prepareHonestySources(ctx);
  const flags: HonestyFlag[] = [];
  for (const text of findUnsupportedFacts(drafts.coverLetter, sources)) flags.push({ draft: 'coverLetter', text });
  for (const text of findUnsupportedFacts(drafts.coldDm, sources)) flags.push({ draft: 'coldDm', text });
  const bulletSeen = new Set<string>();
  for (const b of drafts.cvBullets) {
    for (const text of findUnsupportedFacts(b.improved, sources)) {
      if (bulletSeen.has(text.toLowerCase())) continue;
      bulletSeen.add(text.toLowerCase());
      flags.push({ draft: 'cvBullet', text });
    }
  }
  return flags;
}
