import type { EligibilityVerdict, FitBand, Gap, Requirement } from '@jobpilot/core/schemas';

// Feed card data (docs/03-UI-UX.md §4.5), shared by the /feed server page and the client cards
// (which fill in analyses as they stream in). Pure: no server or browser APIs.

/** The short version of an analysis a feed card shows. */
export interface FeedAnalysis {
  score: number;
  band: FitBand;
  verdict: EligibilityVerdict;
  mustMet: number;
  mustTotal: number;
  topGap: string | null;
  /** False when the analysis was made with an older profile version. */
  current: boolean;
}

export interface FeedItem {
  jobId: string;
  matchDate: string;
  dismissed: boolean;
  title: string;
  company: string | null;
  locationRaw: string | null;
  eligibilityType: 'worldwide' | 'regions' | 'unclear' | null;
  allowedRegions: string[];
  tags: string[];
  postedAt: string | null;
  /** The original post (source terms: a normal followed link on every card). */
  url: string | null;
  attribution: Attribution | null;
  analysis: FeedAnalysis | null;
}

export interface Attribution {
  label: string;
  href: string | null;
}

/** "Via Remote OK (https://remoteok.com)" → { label: 'Via Remote OK', href: 'https://remoteok.com' }. */
export function parseAttribution(raw: string | null): Attribution | null {
  const text = raw?.trim();
  if (!text) return null;
  const m = /^(.*?)\s*\((https?:\/\/[^\s)]+)\)$/.exec(text);
  return m ? { label: m[1]!, href: m[2]! } : { label: text, href: null };
}

export function feedAnalysisFrom(
  a: { score: number; band: FitBand; verdict: EligibilityVerdict; requirements: Pick<Requirement, 'type' | 'status'>[]; gaps: Pick<Gap, 'skill'>[] },
  current = true,
): FeedAnalysis {
  const musts = a.requirements.filter((r) => r.type === 'must');
  return {
    score: a.score,
    band: a.band,
    verdict: a.verdict,
    mustMet: musts.filter((r) => r.status === 'met').length,
    mustTotal: musts.length,
    topGap: a.gaps[0]?.skill.trim() || null,
    current,
  };
}

export type BandFilter = 'all' | FitBand | 'pending';
export type EligibilityFilter = 'all' | 'can_apply';

/** `can_apply` hides jobs the analysis (or the source's location rules) says the user can't apply to. */
export function matchesFilters(item: FeedItem, band: BandFilter, eligibility: EligibilityFilter): boolean {
  if (band === 'pending' && item.analysis) return false;
  if (band !== 'all' && band !== 'pending' && item.analysis?.band !== band) return false;
  if (eligibility === 'can_apply' && item.analysis?.verdict === 'not_eligible') return false;
  return true;
}

/** Whole days between an ISO date and `now`, never negative. */
export function daysAgo(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** The line under the feed title showing that job sources are checked every few hours. */
export interface FeedStatus {
  lastCheckedAt: string;
  newToday: number;
  /** Today's new jobs the user can apply to: in today's matches or in "New today". */
  open: number;
  nextAt: string;
}
