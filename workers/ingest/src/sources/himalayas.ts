import { htmlToText, verdictFromCountryNames } from '@jobpilot/core/jobs';
import { JobInput, type Seniority } from '@jobpilot/core/schemas';
import { z } from 'zod';
import { cleanLine, isoDate, maxSeniority, normalizeTags, seniorityFromTitle, yearlyUsd } from '../normalize';
import type { SourceAdapter, SourceContext, SourcePage } from './types';

// Himalayas Remote Jobs API (docs/10-SOURCES.md §Himalayas). Browse endpoint, newest first,
// 20 jobs per request, cursor pagination. Terms: credit Himalayas with a visible link, every Apply
// action uses `applicationLink` unchanged, show jobs only on our own site, remove expired jobs.

export const HIMALAYAS_API = 'https://himalayas.app/jobs/api';
export const HIMALAYAS_PAGE_SIZE = 20;

const RawJob = z.object({
  title: z.string(),
  companyName: z.string().nullish(),
  companySlug: z.string().nullish(),
  employmentType: z.string().nullish(),
  minSalary: z.number().nullish(),
  maxSalary: z.number().nullish(),
  salaryPeriod: z.string().nullish(),
  currency: z.string().nullish(),
  seniority: z.array(z.string()).nullish(),
  locationRestrictions: z.array(z.string()).nullish(),
  categories: z.array(z.string()).nullish(),
  parentCategories: z.array(z.string()).nullish(),
  description: z.string(),
  pubDate: z.number().nullish(),
  expiryDate: z.number().nullish(),
  applicationLink: z.url(),
  guid: z.string().min(1),
});
type RawJob = z.infer<typeof RawJob>;

const RawPage = z.object({
  nextCursor: z.string().nullish(),
  jobs: z.array(z.unknown()),
});

const SENIORITY_MAP: Readonly<Record<string, Seniority>> = {
  'entry-level': 'junior',
  'mid-level': 'mid',
  senior: 'senior',
  manager: 'lead',
  director: 'lead',
  executive: 'lead',
};

/** One Himalayas job → JobInput, or null when it doesn't validate. */
export function normalizeHimalayasJob(raw: unknown): JobInput | null {
  const parsed = RawJob.safeParse(raw);
  if (!parsed.success) return null;
  const j: RawJob = parsed.data;
  const restrictions = j.locationRestrictions ?? [];
  const verdict = verdictFromCountryNames(restrictions);
  const title = cleanLine(j.title);
  const sourceSeniority = maxSeniority((j.seniority ?? []).map((s) => SENIORITY_MAP[s.toLowerCase()] ?? null));
  const result = JobInput.safeParse({
    sourceId: 'himalayas',
    // guid is the canonical job URL; the path is stable and shorter.
    sourceJobId: j.guid.replace(/^https?:\/\/himalayas\.app\/companies\//, ''),
    url: j.applicationLink, // a himalayas.app URL: satisfies both the link-back and the apply-link rule
    title,
    company: cleanLine(j.companyName),
    companyUrl: j.companySlug ? `https://himalayas.app/companies/${encodeURIComponent(j.companySlug)}` : null,
    description: htmlToText(j.description),
    // An empty list means no restriction (the API's "worldwide").
    locationRaw: restrictions.length ? restrictions.join(', ') : 'Worldwide',
    eligibilityType: verdict.eligibilityType,
    allowedRegions: verdict.allowedRegions,
    eligibilityQuote: verdict.quote,
    seniority: sourceSeniority ?? (title ? seniorityFromTitle(title) : null),
    ...yearlyUsd(j.minSalary, j.maxSalary, j.currency, j.salaryPeriod),
    // Categories are SEO-style ("remote junior data engineer", "… jobs"): drop those, keep 8.
    tags: normalizeTags((j.categories ?? []).filter((c) => !/\b(?:jobs?|remote)\b/i.test(c.replace(/-/g, ' '))), 8),
    postedAt: isoDate(j.pubDate),
    expiresAt: isoDate(j.expiryDate),
  });
  return result.success ? result.data : null;
}

export function parseHimalayasPage(json: unknown): { items: unknown[]; nextCursor: string | null } {
  const page = RawPage.parse(json);
  return { items: page.jobs, nextCursor: page.nextCursor ?? null };
}

export const himalayas: SourceAdapter = {
  id: 'himalayas',
  attribution: 'Via Himalayas (https://himalayas.app)',
  minIntervalMs: 1_000, // 60 req/min with a key; the shared public allowance is lower
  async *pages(ctx: SourceContext): AsyncGenerator<SourcePage> {
    const headers: Record<string, string> = ctx.apiKey ? { authorization: `Bearer ${ctx.apiKey}` } : {};
    let cursor: string | null = null;
    for (let page = 0; page < ctx.maxPages; page++) {
      const url = `${HIMALAYAS_API}?limit=${HIMALAYAS_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const { items, nextCursor } = parseHimalayasPage(await ctx.getJson(url, headers));
      const jobs = items.map(normalizeHimalayasJob);
      const valid = jobs.filter((j): j is JobInput => j !== null);
      yield { jobs: valid, fetched: items.length, invalid: jobs.length - valid.length };
      if (!nextCursor || items.length === 0) return;
      cursor = nextCursor;
    }
  },
};
