import type { AnalysisLLM, Eligibility, Requirement } from '../schemas';

// Evidence check, Architecture §6.1. Pure functions: inputs are never mutated.
//
// Decisions where the doc is silent (keep in sync with the report / docs):
// 1. Normalization also folds diacritics (NFKD + drop combining marks) and treats symbols
//    (\p{S}, e.g. "→", "•", "+") like punctuation. Punctuation becomes a space, not "", so
//    "Next.js" → "next js" on both sides and "React,Node" doesn't glue into one token.
// 2. Substring matching is done on token boundaries ("java" is NOT found in "javascript").
// 3. Fuzzy match: ≥ 85% of the quote's tokens, in order (LCS), inside a source window of
//    `n + max(3, ceil(0.3·n))` tokens, where n = quote token count. For quotes of ≤ 6 tokens
//    this means every token must appear, in order, with a few extra words allowed between.
// 4. A quote that is empty after normalization counts as "not found".
// 5. met/partial with a NULL evidence quote → downgraded too (evidence is required).
// 6. A downgraded requirement gets evidenceQuote=null and evidenceSource='none', so the UI
//    never shows an unverified quote.
// 7. Eligibility: an `eligible`/`not_eligible` verdict whose quote is null or not found in
//    the job text → `unclear`, quote set to null, reasoning replaced with a fixed sentence.
//    This counts as one downgrade. An `unclear` verdict is never counted, but an unverified
//    quote on it is still cleared.

export const NO_EVIDENCE_NOTE = 'no evidence found in CV';
export const UNVERIFIED_ELIGIBILITY_REASONING =
  "We couldn't find the quoted location rule in the job post, so eligibility is unclear.";
export const FUZZY_TOKEN_RATIO = 0.85;

/** Lowercase, fold diacritics, punctuation/symbols → space, collapse whitespace, trim. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const n = normalizeForMatch(text);
  return n ? n.split(' ') : [];
}

/** A source text normalized once, so many quotes can be checked against it cheaply. */
export interface PreparedSource {
  readonly padded: string; // " normalized text "
  readonly tokens: readonly string[];
  readonly counts: ReadonlyMap<string, number>;
}

export function prepareSource(source: string): PreparedSource {
  const normalized = normalizeForMatch(source);
  const tokens = normalized ? normalized.split(' ') : [];
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return { padded: ` ${normalized} `, tokens, counts };
}

/** Length of the longest common subsequence of `a` and `b[from, to)`. */
function lcsLength(a: readonly string[], b: readonly string[], from: number, to: number): number {
  const prev = new Array<number>(a.length + 1).fill(0);
  const cur = new Array<number>(a.length + 1).fill(0);
  for (let j = from; j < to; j++) {
    const bj = b[j];
    for (let i = 1; i <= a.length; i++) {
      cur[i] = a[i - 1] === bj ? prev[i - 1]! + 1 : Math.max(prev[i]!, cur[i - 1]!);
    }
    for (let i = 0; i <= a.length; i++) prev[i] = cur[i]!;
  }
  return prev[a.length]!;
}

/** True if `quote` can be found (exactly or fuzzily) in `source`. See the rules at the top. */
export function quoteFoundIn(quote: string | null | undefined, source: string | PreparedSource): boolean {
  if (quote == null) return false;
  const src = typeof source === 'string' ? prepareSource(source) : source;
  const q = tokenize(quote);
  const n = q.length;
  if (n === 0 || src.tokens.length === 0) return false;

  // 1) exact (normalized) substring, on token boundaries
  if (src.padded.includes(` ${q.join(' ')} `)) return true;

  // 2) fuzzy: ≥ 85% of quote tokens, in order, within one window of the source
  const required = Math.ceil(FUZZY_TOKEN_RATIO * n - 1e-9);
  if (required <= 0) return false;

  // Cheap rejection: not enough quote tokens exist anywhere in the source.
  const need = new Map<string, number>();
  for (const t of q) need.set(t, (need.get(t) ?? 0) + 1);
  let available = 0;
  for (const [t, c] of need) available += Math.min(c, src.counts.get(t) ?? 0);
  if (available < required) return false;

  // An optimal in-order match of ≥ `required` tokens must start on one of the first
  // n - required + 1 quote tokens, so only windows starting on those need checking.
  const starters = new Set(q.slice(0, n - required + 1));
  const window = n + Math.max(3, Math.ceil(0.3 * n));
  const st = src.tokens;
  for (let i = 0; i < st.length; i++) {
    if (!starters.has(st[i]!)) continue;
    if (lcsLength(q, st, i, Math.min(st.length, i + window)) >= required) return true;
  }
  return false;
}

export interface EvidenceContext {
  cvText: string;
  jobText: string;
}

export interface EvidenceCheckResult {
  /** A new analysis; the input object is left untouched. */
  analysis: AnalysisLLM;
  /** Requirements downgraded to `missing` + eligibility forced to `unclear` (0 or 1). */
  downgrades: number;
  /** Breakdown of `downgrades`, handy for evals and logs. */
  requirementDowngrades: number;
  eligibilityDowngraded: boolean;
}

function checkRequirement(r: Requirement, cv: PreparedSource): { req: Requirement; downgraded: boolean } {
  if (r.status === 'missing') return { req: { ...r }, downgraded: false };
  if (quoteFoundIn(r.evidenceQuote, cv)) return { req: { ...r }, downgraded: false };
  return {
    req: { ...r, status: 'missing', evidenceQuote: null, evidenceSource: 'none', note: NO_EVIDENCE_NOTE },
    downgraded: true,
  };
}

function checkEligibility(e: Eligibility, job: PreparedSource): { elig: Eligibility; downgraded: boolean } {
  const base: Eligibility = { ...e, allowedRegions: [...e.allowedRegions] };
  if (quoteFoundIn(e.evidenceQuote, job)) return { elig: base, downgraded: false };
  if (e.verdict === 'unclear') return { elig: { ...base, evidenceQuote: null }, downgraded: false };
  return {
    elig: { ...base, verdict: 'unclear', evidenceQuote: null, reasoning: UNVERIFIED_ELIGIBILITY_REASONING },
    downgraded: true,
  };
}

/**
 * Verify every quote against its source (requirements → CV, eligibility → job post) and
 * downgrade what can't be verified. Returns a new analysis plus the downgrade count
 * (stored as `evidenceDowngrades` / `analyses.evidence_downgrades`).
 */
export function applyEvidenceCheck(analysis: AnalysisLLM, ctx: EvidenceContext): EvidenceCheckResult {
  const cv = prepareSource(ctx.cvText);
  const job = prepareSource(ctx.jobText);

  let requirementDowngrades = 0;
  const requirements = analysis.requirements.map((r) => {
    const { req, downgraded } = checkRequirement(r, cv);
    if (downgraded) requirementDowngrades++;
    return req;
  });
  const { elig, downgraded: eligibilityDowngraded } = checkEligibility(analysis.eligibility, job);

  return {
    analysis: {
      job: { ...analysis.job },
      candidateLevel: analysis.candidateLevel,
      eligibility: elig,
      requirements,
      gaps: analysis.gaps.map((g) => ({ ...g })),
      redFlags: [...analysis.redFlags],
    },
    downgrades: requirementDowngrades + (eligibilityDowngraded ? 1 : 0),
    requirementDowngrades,
    eligibilityDowngraded,
  };
}
