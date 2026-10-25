import { htmlToText } from '@jobpilot/core/jobs';
import { JobInput } from '@jobpilot/core/schemas';
import { z } from 'zod';
import { cleanLine, fixMojibake, isoDate, normalizeTags, seniorityFromTitle, yearlyUsd } from '../normalize';
import type { SourceAdapter, SourceContext, SourcePage } from './types';

// Remote OK API (docs/10-SOURCES.md §Remote OK). One request returns the latest ~100 jobs; the
// first array element is the legal notice. Terms: link back to the job's Remote OK URL (a normal,
// followed link: no rel="nofollow") and name "Remote OK" as the source; don't use their logo.

export const REMOTEOK_API = 'https://remoteok.com/api';

const RawJob = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  slug: z.string().nullish(),
  epoch: z.number().nullish(),
  date: z.string().nullish(),
  company: z.string().nullish(),
  position: z.string(),
  tags: z.array(z.string()).nullish(),
  description: z.string(),
  location: z.string().nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  url: z.url(),
});
type RawJob = z.infer<typeof RawJob>;

// Remote OK tags nearly every post with these, so they carry no signal (and would blur embeddings).
const NOISE_TAGS: ReadonlySet<string> = new Set([
  'digital nomad', 'full time', 'part time', 'contract', 'remote', 'remote work', 'dev', 'exec', 'engineer',
  'senior', 'junior', 'lead', 'technical', 'non tech', 'marketing', 'finance', 'sales', 'ops', 'sys admin',
  'testing', 'medical', 'travel', 'education', 'consulting', 'customer support', 'stats', 'design', 'mobile',
  'ecommerce', 'saas', 'c', 'recruiter', 'payroll', 'accounting',
]);

/** One Remote OK job → JobInput, or null when it doesn't validate (incl. the legal-notice element). */
export function normalizeRemoteOkJob(raw: unknown): JobInput | null {
  const parsed = RawJob.safeParse(raw);
  if (!parsed.success) return null;
  const j: RawJob = parsed.data;
  const title = cleanLine(j.position);
  const result = JobInput.safeParse({
    sourceId: 'remoteok',
    sourceJobId: j.id,
    url: j.url,
    title,
    company: cleanLine(j.company),
    description: htmlToText(fixMojibake(j.description)),
    locationRaw: cleanLine(j.location),
    seniority: title ? seniorityFromTitle(title) : null,
    // Remote OK salaries are yearly USD; 0 means "not given".
    ...yearlyUsd(j.salary_min, j.salary_max, 'USD', 'annual'),
    tags: normalizeTags(j.tags ?? [], 12, NOISE_TAGS),
    postedAt: isoDate(j.date ?? j.epoch ?? null),
  });
  return result.success ? result.data : null;
}

export const remoteok: SourceAdapter = {
  id: 'remoteok',
  attribution: 'Via Remote OK (https://remoteok.com)',
  minIntervalMs: 1_000,
  async *pages(ctx: SourceContext): AsyncGenerator<SourcePage> {
    if (ctx.maxPages < 1) return;
    const json = await ctx.getJson(REMOTEOK_API);
    if (!Array.isArray(json)) throw new Error('Remote OK: expected a JSON array');
    // Element 0 is { last_updated, legal }: not a job.
    const items = json.filter((x) => !(x && typeof x === 'object' && 'legal' in x));
    const jobs = items.map(normalizeRemoteOkJob);
    const valid = jobs.filter((j): j is JobInput => j !== null);
    yield { jobs: valid, fetched: items.length, invalid: jobs.length - valid.length };
  },
};
