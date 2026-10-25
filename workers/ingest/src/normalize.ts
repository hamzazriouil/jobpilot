import { htmlToText } from '@jobpilot/core/jobs';
import { SENIORITY_LEVEL, type Seniority } from '@jobpilot/core/schemas';

// Field helpers shared by the source adapters (Architecture §5.4 "normalize to Job").

/**
 * Repairs UTF-8 text that was decoded as Latin-1 somewhere upstream ("MÃ©xico", "Itâ\u0080\u0099s").
 * Only runs of Latin-1 chars that form valid UTF-8 are replaced, so correct text is left alone.
 */
export function fixMojibake(s: string): string {
  if (!/[Â-ô][\u0080-¿]/.test(s)) return s;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  return s.replace(/[Â-ô][\u0080-¿]{1,3}/g, (run) => {
    try {
      return decoder.decode(Uint8Array.from(run, (c) => c.charCodeAt(0)));
    } catch {
      return run;
    }
  });
}

/** Short plain-text fields (titles, company names): entities decoded, tags dropped, one line. */
export function cleanLine(s: string | null | undefined, max = 200): string | null {
  if (!s) return null;
  const t = htmlToText(fixMojibake(s)).replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Title words → seniority, for sources that don't give one. Most specific first. */
export function seniorityFromTitle(title: string): Seniority | null {
  if (/\b(?:intern|internship|trainee)\b/i.test(title)) return 'intern';
  if (/\b(?:junior|jr\.?|entry[- ]level|graduate|new grad)\b/i.test(title)) return 'junior';
  if (/\b(?:lead|principal|staff|head of|director|vp|vice president|chief|cto|manager)\b/i.test(title)) return 'lead';
  if (/\b(?:senior|sr\.?)(?![a-z])/i.test(title)) return 'senior';
  if (/\b(?:mid[- ]level|intermediate)\b/i.test(title)) return 'mid';
  return null;
}

/** The highest of several levels ("Manager, Senior" → lead). */
export function maxSeniority(levels: Array<Seniority | null>): Seniority | null {
  let best: Seniority | null = null;
  for (const l of levels) if (l && (!best || SENIORITY_LEVEL[l] > SENIORITY_LEVEL[best])) best = l;
  return best;
}

const PERIOD_FACTOR: Readonly<Record<string, number>> = {
  annual: 1, yearly: 1, year: 1, monthly: 12, month: 12, fortnightly: 26, weekly: 52, week: 52,
  daily: 260, day: 260, hourly: 2080, hour: 2080,
};
const MIN_YEARLY = 1_000;
const MAX_YEARLY = 2_000_000;

/**
 * Yearly USD range, or nulls. Only USD is converted (no FX rates to go stale); other currencies → null.
 * Implausible values (0, typos like 1e9) → null.
 */
export function yearlyUsd(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
  period: string | null | undefined = 'annual',
): { salaryMinUsd: number | null; salaryMaxUsd: number | null } {
  const none = { salaryMinUsd: null, salaryMaxUsd: null };
  if ((currency ?? '').toUpperCase() !== 'USD') return none;
  const factor = PERIOD_FACTOR[(period ?? 'annual').toLowerCase()];
  if (!factor) return none;
  const conv = (v: number | null | undefined) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
    const y = Math.round(v * factor);
    return y >= MIN_YEARLY && y <= MAX_YEARLY ? y : null;
  };
  let lo = conv(min);
  let hi = conv(max);
  if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
  return { salaryMinUsd: lo, salaryMaxUsd: hi };
}

/** "AI-Engineer" → "ai engineer"; trims, dedupes, caps. */
export function normalizeTags(tags: readonly string[], max = 12, drop: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const n = fixMojibake(t).toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (n && n.length <= 40 && !drop.has(n) && !out.includes(n)) out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

/** Unix seconds or an ISO string → ISO string; invalid → null. */
export function isoDate(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
