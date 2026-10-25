import { describe, expect, it } from 'vitest';
import { daysAgo, feedAnalysisFrom, matchesFilters, parseAttribution, type FeedItem } from './feed';

describe('parseAttribution', () => {
  it('splits the stored "Via X (url)" string', () => {
    expect(parseAttribution('Via Remote OK (https://remoteok.com)')).toEqual({ label: 'Via Remote OK', href: 'https://remoteok.com' });
  });
  it('keeps plain names as text', () => {
    expect(parseAttribution('Himalayas')).toEqual({ label: 'Himalayas', href: null });
    expect(parseAttribution('  ')).toBeNull();
    expect(parseAttribution(null)).toBeNull();
  });
});

describe('feedAnalysisFrom', () => {
  it('counts met must-haves and takes the first gap', () => {
    const a = feedAnalysisFrom({
      score: 84,
      band: 'strong',
      verdict: 'eligible',
      requirements: [
        { type: 'must', status: 'met' },
        { type: 'must', status: 'partial' },
        { type: 'must', status: 'met' },
        { type: 'nice', status: 'met' },
      ],
      gaps: [{ skill: ' evals experience ' }, { skill: 'Go' }],
    });
    expect(a).toMatchObject({ mustMet: 2, mustTotal: 3, topGap: 'evals experience', current: true });
  });
  it('has no gap when there are none', () => {
    expect(feedAnalysisFrom({ score: 10, band: 'long_shot', verdict: 'unclear', requirements: [], gaps: [] }, false)).toMatchObject({
      topGap: null,
      current: false,
    });
  });
});

const base: FeedItem = {
  jobId: 'j',
  matchDate: '2026-10-26',
  dismissed: false,
  title: 'AI Engineer',
  company: null,
  locationRaw: null,
  eligibilityType: 'worldwide',
  allowedRegions: [],
  tags: [],
  postedAt: null,
  url: null,
  attribution: null,
  analysis: null,
};
const analyzed = (band: 'strong' | 'stretch', verdict: 'eligible' | 'not_eligible'): FeedItem => ({
  ...base,
  analysis: { score: 50, band, verdict, mustMet: 1, mustTotal: 2, topGap: null, current: true },
});

describe('matchesFilters', () => {
  it('filters by band, with "pending" for jobs not analyzed yet', () => {
    expect(matchesFilters(analyzed('strong', 'eligible'), 'strong', 'all')).toBe(true);
    expect(matchesFilters(analyzed('stretch', 'eligible'), 'strong', 'all')).toBe(false);
    expect(matchesFilters(base, 'strong', 'all')).toBe(false);
    expect(matchesFilters(base, 'pending', 'all')).toBe(true);
    expect(matchesFilters(analyzed('strong', 'eligible'), 'pending', 'all')).toBe(false);
  });
  it('"can apply" hides only jobs analyzed as not eligible', () => {
    expect(matchesFilters(analyzed('strong', 'not_eligible'), 'all', 'can_apply')).toBe(false);
    expect(matchesFilters(analyzed('strong', 'eligible'), 'all', 'can_apply')).toBe(true);
    expect(matchesFilters(base, 'all', 'can_apply')).toBe(true);
  });
});

describe('daysAgo', () => {
  it('floors to whole days and never goes negative', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(daysAgo('2026-10-24T13:00:00Z', now)).toBe(1);
    expect(daysAgo('2026-10-27T00:00:00Z', now)).toBe(0);
  });
});
