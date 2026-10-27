import { htmlToText } from '@jobpilot/core/jobs';
import { JobInput, type Seniority } from '@jobpilot/core/schemas';
import { z } from 'zod';
import { cleanLine, isoDate, normalizeTags, seniorityFromTitle, yearlyUsd } from '../normalize';
import type { SourceAdapter, SourceContext, SourcePage } from './types';

// Jobicy Jobs API (docs/10-SOURCES.md §Jobicy). Free, no key, newest first, cursor pagination over a
// 7-day window. Terms (https://jobicy.com/jobs-rss-feed, read 2026-10-27): commercial use and job
// aggregators are allowed without an agreement; credit Jobicy with a clickable link; apply links
// must go to the original Jobicy page (the `url` we store); poll at most once an hour (our cron runs
// every 6 hours); handle 429 with a deferred retry (createGetJson retries once). Closed listings
// are hidden by the daily status sync (jobicyStatusSync in ../maintenance.ts).
//
// Read as one stream per industry, one page each per run: 2 pages × 4 subrequests fits the Workers
// Free budget next to Himalayas and Remote OK (see wrangler.jsonc). `jobGeo` ("EMEA, LATAM, USA",
// "Anywhere") is left to the pipeline's location rules, which understand both countries and regions.

export const JOBICY_API = 'https://jobicy.com/api/jobs';
export const JOBICY_INDUSTRIES = ['engineering', 'data-science'] as const;
/** = EMBED_BATCH_SIZE, so each page is one embedding call. */
export const JOBICY_PAGE_SIZE = 50;
export const JOBICY_PAGES_PER_RUN = JOBICY_INDUSTRIES.length;

const RawJob = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  url: z.url(),
  jobTitle: z.string(),
  companyName: z.string().nullish(),
  jobIndustry: z.array(z.string()).nullish(),
  jobType: z.array(z.string()).nullish(),
  jobGeo: z.string().nullish(),
  jobLevel: z.string().nullish(),
  jobDescription: z.string(),
  pubDate: z.string().nullish(),
  salaryMin: z.number().nullish(),
  salaryMax: z.number().nullish(),
  salaryCurrency: z.string().nullish(),
  salaryPeriod: z.string().nullish(),
});
type RawJob = z.infer<typeof RawJob>;

const RawPage = z.object({
  nextCursor: z.string().nullish(),
  jobs: z.array(z.unknown()),
});

const LEVELS: Readonly<Record<string, Seniority>> = {
  entry: 'junior',
  junior: 'junior',
  midweight: 'mid',
  middle: 'mid',
  'mid-level': 'mid',
  senior: 'senior',
  lead: 'lead',
  manager: 'lead',
  director: 'lead',
};

/** "EMEA,  LATAM,  USA" → "EMEA, LATAM, USA"; "Anywhere" stays (the rules read it as worldwide). */
export function jobicyLocation(geo: string | null | undefined): string | null {
  const parts = (geo ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** One Jobicy job → JobInput, or null when it doesn't validate. */
export function normalizeJobicyJob(raw: unknown): JobInput | null {
  const parsed = RawJob.safeParse(raw);
  if (!parsed.success) return null;
  const j: RawJob = parsed.data;
  const title = cleanLine(j.jobTitle);
  const result = JobInput.safeParse({
    sourceId: 'jobicy',
    sourceJobId: j.id,
    url: j.url, // the Jobicy listing page: the required link-back and apply link
    title,
    company: cleanLine(j.companyName),
    description: htmlToText(j.jobDescription),
    locationRaw: jobicyLocation(j.jobGeo),
    seniority: LEVELS[(j.jobLevel ?? '').toLowerCase()] ?? (title ? seniorityFromTitle(title) : null),
    ...yearlyUsd(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod),
    tags: normalizeTags(j.jobIndustry ?? [], 4),
    postedAt: isoDate(j.pubDate),
  });
  return result.success ? result.data : null;
}

export function parseJobicyPage(json: unknown): { items: unknown[]; nextCursor: string | null } {
  const page = RawPage.parse(json);
  return { items: page.jobs, nextCursor: page.nextCursor ?? null };
}

export const jobicy: SourceAdapter = {
  id: 'jobicy',
  attribution: 'Via Jobicy (https://jobicy.com)',
  minIntervalMs: 1_000,
  async *pages(ctx: SourceContext): AsyncGenerator<SourcePage> {
    let budget = Math.min(ctx.maxPages, JOBICY_PAGES_PER_RUN);
    for (const industry of JOBICY_INDUSTRIES) {
      if (budget <= 0) return;
      budget--;
      const { items } = parseJobicyPage(await ctx.getJson(`${JOBICY_API}?count=${JOBICY_PAGE_SIZE}&industry=${industry}`));
      const jobs = items.map(normalizeJobicyJob);
      const valid = jobs.filter((j): j is JobInput => j !== null);
      yield { jobs: valid, fetched: items.length, invalid: jobs.length - valid.length, stream: industry };
    }
  },
};
