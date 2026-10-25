import { COUNTRY_REGIONS, REGION } from '../regions';
import {
  CA_PROVINCE_NAMES,
  COUNTRY_NAME_TO_CODE,
  countryCodeFromName,
  ISO_COUNTRY_CODES,
  US_STATE_CODES,
  US_STATE_NAMES,
} from './countries';

// Rule-based location eligibility (docs/09-PHASE1-CONTRACT.md §3, Architecture §5.4).
// No LLM here. The ingest Worker sends only 'unclear' verdicts to the LLM fallback, and the DB
// treats 'unclear' as eligible (match_jobs), so when in doubt this returns 'unclear', never a guess.
//
// Order of evidence:
//   1. the source's location field (`locationRaw`): worldwide words, regions, countries, US states,
//      "City, ST", ISO-2 codes; time-zone phrases only when no place is named
//   2. restriction sentences in the description ("must be based in…", "US only", "authorized to work in…")
//   3. combine: agree → the narrower set; worldwide vs. a restriction, or disjoint sets → 'unclear'

export interface LocationVerdict {
  eligibilityType: 'worldwide' | 'regions' | 'unclear';
  allowedRegions: string[]; // codes from REGION / ISO-2 in @jobpilot/core/regions
  quote: string | null; // the exact text the verdict is based on
}

const R = REGION;
const UNCLEAR: LocationVerdict = Object.freeze({ eligibilityType: 'unclear', allowedRegions: [], quote: null }) as LocationVerdict;
const QUOTE_MAX = 300;
const DESCRIPTION_SCAN_MAX = 8_000;

// ───────────────────────────── place phrases ─────────────────────────────

/** Region words (normalized, matched case-insensitively). Country groups expand to ISO codes. */
const REGION_PHRASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['european union', [R.EU]],
  ['european economic area', [R.EEA]],
  ['eea', [R.EEA]],
  ['emea', [R.EMEA]],
  ['europe', [R.EUROPE]],
  ['european', [R.EUROPE]],
  ['latam', [R.LATAM]],
  ['latin america', [R.LATAM]],
  ['latin american', [R.LATAM]],
  ['south america', [R.LATAM]],
  ['central america', [R.LATAM]],
  ['north america', [R.NORTH_AMERICA]],
  ['north american', [R.NORTH_AMERICA]],
  ['noram', [R.NORTH_AMERICA]],
  ['namer', [R.NORTH_AMERICA]],
  ['americas', [R.AMERICAS]],
  ['amer', [R.AMERICAS]],
  ['apac', [R.APAC]],
  ['apj', [R.APAC]],
  ['asia pacific', [R.APAC]],
  ['oceania', [R.APAC]],
  ['south asia', [R.SOUTH_ASIA]],
  ['southeast asia', [R.ASIA]],
  ['south east asia', [R.ASIA]],
  ['asia', [R.ASIA]],
  ['asian', [R.ASIA]],
  ['mena', [R.MENA]],
  ['middle east', [R.MENA]],
  ['north africa', [R.MENA, R.AFRICA]],
  ['africa', [R.AFRICA]],
  ['african', [R.AFRICA]],
  ['gcc', [R.GCC]],
  ['gulf countries', [R.GCC]],
  ['gulf region', [R.GCC]],
  ['nordics', ['SE', 'NO', 'DK', 'FI', 'IS']],
  ['nordic countries', ['SE', 'NO', 'DK', 'FI', 'IS']],
  ['scandinavia', ['SE', 'NO', 'DK']],
  ['dach', ['DE', 'AT', 'CH']],
  ['benelux', ['BE', 'NL', 'LU']],
  ['baltics', ['EE', 'LV', 'LT']],
  ['baltic states', ['EE', 'LV', 'LT']],
  ['anz', ['AU', 'NZ']],
  ['new south wales', ['AU']], // not Wales (GB)
  ['queensland', ['AU']],
  ['usa', ['US']],
  ['uae', ['AE']],
  ['ksa', ['SA']],
  ['drc', ['CD']],
];

/** normalized phrase → codes. Countries, US states, Canadian provinces and regions in one table. */
function buildPhraseTable(): Map<string, readonly string[]> {
  const t = new Map<string, readonly string[]>();
  for (const [name, cc] of COUNTRY_NAME_TO_CODE) t.set(name, [cc]);
  for (const s of US_STATE_NAMES) t.set(s, ['US']);
  for (const p of CA_PROVINCE_NAMES) t.set(p, ['CA']);
  for (const [phrase, codes] of REGION_PHRASES) t.set(phrase, codes);
  return t;
}
const PHRASES = buildPhraseTable();

// Longest first, so "new mexico" beats "mexico", "south africa" beats "africa", "papua new guinea" beats "guinea".
const PHRASE_RE = new RegExp(
  `(?<![a-z0-9])(?:${[...PHRASES.keys()]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/ /g, ' +'))
    .join('|')})(?![a-z0-9])`,
  'g',
);

// Short aliases that are also English words or need their dots: matched case-sensitively.
const ALIAS_RE = /(?<![A-Za-z])(U\.S\.A\.?|U\.S\.?|US|U\.K\.?|UK|E\.U\.|EU)(?![A-Za-z])/g;
const ALIAS_CODES: Readonly<Record<string, string[]>> = { US: ['US'], UK: ['GB'], EU: [R.EU] };

// "Columbus, IN", "Toronto, ON": a state/province code after a city name (location field only).
// Not after another code ("DE, FR, NL" is a country list) or after "Remote" ("Remote, DE" is Germany).
// Province codes that are also busy country codes (NL, PE, SK) are left out.
const CA_PROVINCE_CODES = new Set(['ON', 'BC', 'QC', 'AB', 'MB', 'NS', 'NB', 'YT', 'NU', 'NT']);
const CITY_STATE_RE = /([A-Za-z][A-Za-z.'-]*(?: [A-Za-z][A-Za-z.'-]*)*),\s*([A-Z]{2})(?![A-Za-z])/g;
const NOT_A_CITY = /^(?:[A-Z]{2}|remote|hybrid|on-?site|anywhere)$/i;
const ISO_TOKEN_RE = /(?<![A-Za-z])([A-Z]{2})(?![A-Za-z])/g;

const WORLDWIDE_RE =
  /(?<![a-z0-9])(?:worldwide|world +wide|anywhere|global|globally|international|internationally|everywhere|all +countries|any +country|any +location|location +independent)(?![a-z0-9])/;

// The listed places are not the whole story → don't claim a region set.
const INCOMPLETE_RE =
  /(?<![a-z0-9])(?:other +countries|more +countries|other +locations|and +more|etc|excluding|exclude|except|not +available|not +eligible|outside +of|outside +the)(?![a-z0-9])/;

// ───────────────────────────── text helpers ─────────────────────────────

/**
 * Same-length lowercase ASCII copy: letters/digits kept (accents stripped), everything else → ' '.
 * Keeping the length lets a match in `norm` blank the same span in the original-case string.
 */
function normalizeSameLength(s: string): string {
  let out = '';
  for (const ch of s) {
    const d = ch.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
    const one = d.length === 1 && /[a-z0-9]/.test(d) ? d : ' ';
    // Astral characters are 2 UTF-16 units: pad so indices stay aligned.
    out += ch.length === 2 ? one + ' ' : one;
  }
  return out;
}

function blank(s: string, start: number, end: number): string {
  return s.slice(0, start) + ' '.repeat(end - start) + s.slice(end);
}

/** Drops "(US preferred)", "UK is a plus", "ideally EU": preferences are not restrictions. */
function dropPreferences(s: string): string {
  return s
    .replace(/\([^)]*\b(?:prefer\w*|ideal\w*|bonus|plus|nice to have)\b[^)]*\)/gi, ' ')
    .split(/([,;|/]|\s[-–—]\s)/)
    .map((seg) => (/\b(?:prefer\w*|ideally|bonus|is a plus|nice to have)\b/i.test(seg) ? ' ' : seg))
    .join('');
}

function quoteOf(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > QUOTE_MAX ? `${t.slice(0, QUOTE_MAX - 1)}…` : t;
}

function uniq(codes: Iterable<string>): string[] {
  return [...new Set(codes)];
}

// ───────────────────────────── time zones ─────────────────────────────

const ZONE_OFFSETS: Readonly<Record<string, number>> = {
  UTC: 0, GMT: 0, WET: 0, WEST: 1, BST: 1, CET: 1, CEST: 2, EET: 2, EEST: 3, MSK: 3,
  EST: -5, EDT: -4, ET: -5, CST: -6, CDT: -5, CT: -6, MST: -7, MDT: -6, MT: -7, PST: -8, PDT: -7, PT: -8,
  SGT: 8, JST: 9, AEST: 10, AEDT: 11,
};
const ZONE = Object.keys(ZONE_OFFSETS).sort((a, b) => b.length - a.length).join('|');
// Two-letter zones (ET, PT, CT, MT) are also ISO codes (Ethiopia, Portugal, Malta): never trusted alone.
const ZONE_LONG = Object.keys(ZONE_OFFSETS)
  .filter((z) => z.length > 2)
  .sort((a, b) => b.length - a.length)
  .join('|');
const OFFSET = String.raw`[+\-−–]\s*\d{1,2}(?:[:.]\d{2})?`;

// "UTC±3", "CET +/- 2h", "EST plus or minus 3 hours"
const TZ_PLUSMINUS_RE = new RegExp(String.raw`\b(${ZONE})\s*(?:±|\+\s*\/\s*-|\+-|plus or minus)\s*(\d{1,2})\s*(?:h|hrs?|hours?)?\b`, 'g');
// "UTC-5 to UTC-8", "GMT+1 – GMT+3", "UTC+2", "between UTC-3 and +3"
const TZ_RANGE_RE = new RegExp(
  String.raw`\b(UTC|GMT)\s*(${OFFSET})?(?:\s*(?:to|through|until|and|-|–|—)\s*(?:UTC|GMT)?\s*(${OFFSET}))?`,
  'g',
);
// "PST to EST", "CET-EET", or a single "EST" / "CET"
const TZ_NAMED_RE = new RegExp(String.raw`\b(${ZONE_LONG})\b(?:\s*(?:to|through|-|–|and)\s*(${ZONE_LONG})\b)?`, 'g');
// "US time zones", "European business hours"
const TZ_REGION_RE =
  /\b(North American|American|US|USA|U\.S\.|Eastern|Pacific|Mountain|Central|Latin American|LATAM|Americas|European|Europe|EU|EMEA|African|Asian|APAC|Asia[- ]Pacific|Australian)\s+(?:time\s*zones?|timezones?|hours|business hours|working hours)\b/gi;

function parseOffset(raw: string): number {
  const sign = /^[\-−–]/.test(raw) ? -1 : 1;
  const [h, m] = raw.replace(/^[+\-−–]\s*/, '').split(/[:.]/);
  return sign * (Number(h) + (m ? Number(m) / 60 : 0));
}

function regionTzRange(word: string): [number, number] {
  const w = word.toLowerCase();
  if (/asian|apac|asia|australian/.test(w)) return [5, 11];
  if (/europe|eu|emea|african/.test(w)) return [-1, 3];
  return [-8, -4]; // the Americas words, incl. US Eastern/Central/Mountain/Pacific
}

interface TzHit {
  range: [number, number];
  quote: string;
}

/** Finds time-zone phrases in `s`, returns them and `s` with their spans blanked. */
function extractTimeZones(s: string): { hits: TzHit[]; rest: string } {
  const hits: TzHit[] = [];
  let rest = s;
  const take = (re: RegExp, toRange: (m: RegExpExecArray) => [number, number] | null) => {
    for (const m of rest.matchAll(re)) {
      const range = toRange(m);
      if (!range) continue;
      hits.push({ range, quote: m[0].trim() });
      rest = blank(rest, m.index, m.index + m[0].length);
    }
  };
  take(TZ_REGION_RE, (m) => regionTzRange(m[1]!));
  take(TZ_PLUSMINUS_RE, (m) => {
    const base = ZONE_OFFSETS[m[1]!]!;
    const n = Number(m[2]);
    return [base - n, base + n];
  });
  take(TZ_RANGE_RE, (m) => {
    if (!m[2] && !m[3]) return [0, 0]; // bare "UTC" / "GMT"
    const a = m[2] ? parseOffset(m[2]) : 0;
    const b = m[3] ? parseOffset(m[3]) : a;
    return [Math.min(a, b), Math.max(a, b)];
  });
  take(TZ_NAMED_RE, (m) => {
    const a = ZONE_OFFSETS[m[1]!]!;
    const b = m[2] ? ZONE_OFFSETS[m[2]]! : a;
    return [Math.min(a, b), Math.max(a, b)];
  });
  return { hits, rest };
}

/**
 * Offset range → broad regions, inclusively (UTC±3 reaches Brazil and Eastern Europe → AMERICAS + EMEA).
 * A range wider than 9 hours says almost nothing about where people may live → null (unclear).
 */
function regionsForTzRange(lo: number, hi: number): string[] | null {
  if (hi - lo > 9) return null;
  const out: string[] = [];
  if (lo <= -3 && hi >= -10) out.push(R.AMERICAS);
  if (lo <= 4 && hi >= -1) out.push(R.EMEA);
  if (lo <= 13 && hi >= 5) out.push(R.APAC);
  return out.length ? out : null;
}

// ───────────────────────────── place extraction ─────────────────────────────

interface PlaceScan {
  codes: string[];
  worldwide: boolean;
  incomplete: boolean;
  tz: TzHit[];
}

/**
 * Finds places in a location field (`mode: 'field'`, which also trusts ISO-2 tokens and "City, ST")
 * or in a restriction phrase taken from a description (`mode: 'phrase'`).
 */
function scanPlaces(raw: string, mode: 'field' | 'phrase'): PlaceScan {
  let work = dropPreferences(raw.replace(/\s&\s/g, ' and '));
  if (/[🌍🌎🌏]/u.test(work)) work = `${work} worldwide`;
  // "anywhere in the world" is worldwide; "anywhere in Europe" is a region scope.
  work = work
    .replace(/\b(?:from\s+)?anywhere\s+(?:in|on)\s+(?:the\s+)?(?:world|planet|globe)\b/gi, ' worldwide ')
    .replace(/\banywhere\s+(?:in|within|across|from)\s+(?:the\s+)?/gi, ' in ');

  const { hits: tz, rest } = extractTimeZones(work);
  work = rest;
  let norm = normalizeSameLength(work);

  const worldwide = WORLDWIDE_RE.test(norm);
  const incomplete = INCOMPLETE_RE.test(norm);
  const codes: string[] = [];

  for (const m of norm.matchAll(PHRASE_RE)) {
    const key = m[0].replace(/ +/g, ' ');
    codes.push(...(PHRASES.get(key) ?? []));
    work = blank(work, m.index, m.index + m[0].length);
  }
  norm = normalizeSameLength(work);

  for (const m of work.matchAll(ALIAS_RE)) {
    const key = m[1]!.replace(/\./g, '').replace(/^USA$/, 'US');
    codes.push(...(ALIAS_CODES[key] ?? []));
    work = blank(work, m.index, m.index + m[0].length);
  }

  if (mode === 'field') {
    for (const m of work.matchAll(CITY_STATE_RE)) {
      if (NOT_A_CITY.test(m[1]!.trim())) continue;
      const st = m[2]!;
      if (US_STATE_CODES.has(st)) codes.push('US');
      else if (CA_PROVINCE_CODES.has(st)) codes.push('CA');
      else continue;
      work = blank(work, m.index, m.index + m[0].length);
    }
    for (const m of work.matchAll(ISO_TOKEN_RE)) {
      const cc = m[1]!;
      // 'NA' is both Namibia and North America: too ambiguous to trust as a bare token.
      if (cc !== 'NA' && ISO_COUNTRY_CODES.has(cc)) codes.push(cc);
    }
  }

  return { codes: uniq(codes), worldwide, incomplete, tz };
}

// ───────────────────────────── verdicts ─────────────────────────────

type Partial =
  | { kind: 'worldwide'; quote: string }
  | { kind: 'regions'; codes: string[]; quote: string }
  | { kind: 'conflict' }
  | { kind: 'none' };

function fieldVerdict(locationRaw: string): Partial {
  const scan = scanPlaces(locationRaw, 'field');
  const quote = quoteOf(locationRaw);
  if (scan.incomplete) return { kind: 'conflict' };
  if (scan.worldwide && scan.codes.length) return { kind: 'conflict' };
  if (scan.worldwide) return { kind: 'worldwide', quote };
  if (scan.codes.length) return { kind: 'regions', codes: scan.codes, quote };
  return tzVerdict(scan.tz);
}

function tzVerdict(tz: TzHit[]): Partial {
  if (!tz.length) return { kind: 'none' };
  const lo = Math.min(...tz.map((t) => t.range[0]));
  const hi = Math.max(...tz.map((t) => t.range[1]));
  const codes = regionsForTzRange(lo, hi);
  if (!codes) return { kind: 'conflict' };
  return { kind: 'regions', codes, quote: tz.map((t) => t.quote).join('; ') };
}

const STOP = String.raw`[^.;:!?\n]`;
// Sentences that restrict (or explicitly open) where candidates may live. Group 1 = the place phrase.
const DESC_RESTRICT_RES: readonly RegExp[] = [
  new RegExp(
    String.raw`\b(?:must|need to|needs to|required to|have to|has to|should)\s+(?:be\s+)?(?:currently\s+|physically\s+)?(?:located|based|residing|reside|living|live|resident|a resident)\s+(?:in|within|of)\s+(${STOP}{2,120})`,
    'gi',
  ),
  new RegExp(
    String.raw`\b(?:open|available)\s+(?:only\s+)?to\s+(?:candidates|applicants|residents|people|those|individuals|engineers|developers)\s+(?:who\s+(?:are|live)\s+)?(?:located\s+|based\s+|living\s+|residing\s+)?(?:in|within|from)\s+(${STOP}{2,120})`,
    'gi',
  ),
  new RegExp(
    String.raw`\b(?:only|exclusively)\s+(?:hiring|accepting|considering|open to)\s+(?:candidates\s+|applicants\s+|people\s+|talent\s+)?(?:located\s+|based\s+|living\s+|residing\s+)?(?:in|from|within)\s+(${STOP}{2,120})`,
    'gi',
  ),
  new RegExp(
    String.raw`\b(?:authori[sz]ed|eligible|legally (?:able|allowed|permitted))\s+to\s+work\s+(?:in|within|for)\s+(${STOP}{2,80})`,
    'gi',
  ),
  // "US only", "USA-only", "EU Only", "(Europe only)", "India Only"
  /((?:\b[A-Z][A-Za-z.]*|\bU\.S\.)(?:[ /&,]+(?:and\s+)?[A-Z][A-Za-z.]*){0,3})[\s-]+[Oo]nly\b/g,
  /\b(?:location|locations|based in|candidate location)\s*:\s*([^\n.;]{2,120})/gi,
];

// Explicitly open to everyone, unless followed by "in <somewhere>" (handled by scanPlaces).
const DESC_WORLDWIDE_RE =
  /\b(?:work(?:ing)?\s+from\s+anywhere|from\s+anywhere\s+in\s+the\s+world|anywhere\s+in\s+the\s+world|(?:hire|hiring|open\s+to|welcome)\s+(?:talent|candidates|people|applicants|engineers)?\s*(?:from\s+)?(?:anywhere|all\s+over\s+the\s+world|around\s+the\s+world)|fully\s+remote\s*[(,-]?\s*(?:worldwide|global(?:ly)?)|remote\s*[(-]\s*(?:worldwide|global|anywhere)|location[- ]independent)\b/gi;

function sentenceAround(text: string, start: number, end: number): string {
  const before = text.lastIndexOf('\n', start);
  const dot = Math.max(text.lastIndexOf('. ', start), before);
  const s = dot >= 0 ? dot + 1 : 0;
  const nextDot = text.slice(end).search(/[.!?\n]/);
  const e = nextDot >= 0 ? end + nextDot + 1 : text.length;
  return text.slice(s, Math.min(e, s + QUOTE_MAX)).trim();
}

function descriptionVerdict(description: string): Partial {
  const text = description.slice(0, DESCRIPTION_SCAN_MAX);
  let worldwideQuote: string | null = null;
  const codes: string[] = [];
  const quotes: string[] = [];
  let conflict = false;

  for (const m of text.matchAll(DESC_WORLDWIDE_RE)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    // "work from anywhere in the US" is a region, not worldwide
    if (/^\s+(?:in|within|across)\s+(?!the\s+world)/i.test(after)) continue;
    worldwideQuote ??= sentenceAround(text, m.index, m.index + m[0].length);
  }

  for (const re of DESC_RESTRICT_RES) {
    for (const m of text.matchAll(re)) {
      const scan = scanPlaces(m[1]!, 'phrase');
      if (scan.worldwide && !scan.codes.length) {
        worldwideQuote ??= sentenceAround(text, m.index, m.index + m[0].length);
        continue;
      }
      if (!scan.codes.length) continue;
      if (scan.incomplete || scan.worldwide) conflict = true;
      codes.push(...scan.codes);
      quotes.push(sentenceAround(text, m.index, m.index + m[0].length));
    }
  }

  if (conflict || (worldwideQuote && codes.length)) return { kind: 'conflict' };
  if (codes.length) return { kind: 'regions', codes: uniq(codes), quote: quoteOf(uniq(quotes).join(' … ')) };
  if (worldwideQuote) return { kind: 'worldwide', quote: quoteOf(worldwideQuote) };
  return { kind: 'none' };
}

// ── region containment, for "do these two sets agree?" ──
const REGION_PARENTS: Readonly<Record<string, readonly string[]>> = {
  [R.EU]: [R.EEA, R.EUROPE, R.EMEA],
  [R.EEA]: [R.EUROPE, R.EMEA],
  [R.UK]: [R.EUROPE, R.EMEA],
  [R.EUROPE]: [R.EMEA],
  [R.AFRICA]: [R.EMEA],
  [R.MENA]: [R.EMEA],
  [R.GCC]: [R.MENA, R.EMEA],
  [R.NORTH_AMERICA]: [R.AMERICAS],
  [R.LATAM]: [R.AMERICAS],
  [R.SOUTH_ASIA]: [R.ASIA, R.APAC],
  [R.ASIA]: [R.APAC],
};

/** True when region/country `outer` contains (or equals) `inner`. */
function contains(outer: string, inner: string): boolean {
  if (outer === inner) return true;
  if (inner === 'GB' && outer === R.UK) return true;
  // Region codes first: 'NA' is North America here, not Namibia.
  const parents: readonly string[] = REGION_PARENTS[inner] ?? COUNTRY_REGIONS[inner] ?? [];
  return parents.includes(outer);
}

function setContains(outer: readonly string[], inner: readonly string[]): boolean {
  return inner.every((i) => outer.some((o) => contains(o, i)));
}

function combine(field: Partial, desc: Partial): LocationVerdict {
  if (field.kind === 'conflict' || desc.kind === 'conflict') return { ...UNCLEAR, allowedRegions: [] };
  if (field.kind === 'none' && desc.kind === 'none') return { ...UNCLEAR, allowedRegions: [] };
  if (field.kind === 'none') return toVerdict(desc);
  if (desc.kind === 'none') return toVerdict(field);
  if (field.kind === 'worldwide' && desc.kind === 'worldwide') return toVerdict(field);
  if (field.kind === 'regions' && desc.kind === 'regions') {
    // Agreeing sets → keep the narrower one; anything else is a contradiction.
    if (setContains(desc.codes, field.codes)) return toVerdict(field);
    if (setContains(field.codes, desc.codes)) return toVerdict(desc);
  }
  return { ...UNCLEAR, allowedRegions: [] };
}

function toVerdict(p: Partial): LocationVerdict {
  if (p.kind === 'worldwide') return { eligibilityType: 'worldwide', allowedRegions: [], quote: p.quote };
  if (p.kind === 'regions') return { eligibilityType: 'regions', allowedRegions: p.codes, quote: p.quote };
  return { ...UNCLEAR, allowedRegions: [] };
}

/** Rules only, no LLM. Returns 'unclear' when the rules can't decide. */
export function classifyLocationRules(input: { locationRaw: string | null; description: string }): LocationVerdict {
  const raw = input.locationRaw?.trim() ?? '';
  const field: Partial = raw ? fieldVerdict(raw) : { kind: 'none' };
  return combine(field, descriptionVerdict(input.description ?? ''));
}

/**
 * Himalayas-style structured restrictions: a list of country names, empty = no restriction.
 * Unknown names (e.g. "Bouvet Island" variants) are skipped; if none is known → 'unclear'.
 */
export function verdictFromCountryNames(names: readonly string[]): LocationVerdict {
  if (!names.length) return { eligibilityType: 'worldwide', allowedRegions: [], quote: null };
  const codes = uniq(
    names
      .map(countryCodeFromName)
      .filter((c): c is string => Boolean(c)),
  );
  if (!codes.length) return { ...UNCLEAR, allowedRegions: [] };
  return { eligibilityType: 'regions', allowedRegions: codes, quote: quoteOf(names.join(', ')) };
}
