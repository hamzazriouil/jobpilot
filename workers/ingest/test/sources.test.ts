import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { silentLog } from '../src/log';
import { himalayas, himalayasStreams, normalizeHimalayasJob, pagesPerStream, parseHimalayasPage } from '../src/sources/himalayas';
import { normalizeRemoteOkJob, remoteok } from '../src/sources/remoteok';
import { jobicy, jobicyLocation, JOBICY_INDUSTRIES, JOBICY_PAGES_PER_RUN, normalizeJobicyJob } from '../src/sources/jobicy';
import { classifyLocationRules } from '@jobpilot/core/jobs';
import type { SourcePage } from '../src/sources';

// Trimmed real responses (2026-10-25), descriptions cut to 1,500 chars.
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const himalayasPage = fixture('himalayas.json') as { nextCursor: string; jobs: unknown[] };
const remoteOkFeed = fixture('remoteok.json') as unknown[];

async function collect(gen: AsyncGenerator<SourcePage>): Promise<SourcePage[]> {
  const out: SourcePage[] = [];
  for await (const p of gen) out.push(p);
  return out;
}

describe('himalayas adapter', () => {
  const jobs = himalayasPage.jobs.map(normalizeHimalayasJob);
  const byTitle = (t: string) => jobs.find((j) => j?.title.startsWith(t))!;

  it('normalizes every fixture job', () => {
    expect(jobs.every((j) => j !== null)).toBe(true);
    expect(parseHimalayasPage(himalayasPage).nextCursor).toBe(himalayasPage.nextCursor);
  });

  it('uses applicationLink as the url and the guid path as the source id', () => {
    const j = byTitle('Full Stack Engineer');
    expect(j.url).toBe('https://himalayas.app/companies/dante/jobs/full-stack-engineer?utm_source=api');
    expect(j.sourceJobId).toBe('dante/jobs/full-stack-engineer');
    expect(j.companyUrl).toBe('https://himalayas.app/companies/dante');
    expect(j.description).not.toMatch(/<[a-z]/i);
  });

  it('maps structured location restrictions to eligibility', () => {
    expect(byTitle('Talent Database')).toMatchObject({ eligibilityType: 'regions', allowedRegions: ['IN'], locationRaw: 'India' });
    const emea = byTitle('Revenue Operations Manager');
    expect(emea.eligibilityType).toBe('regions');
    expect(emea.allowedRegions).toEqual(expect.arrayContaining(['MA', 'FR', 'NG', 'AE', 'GB']));
    expect(emea.allowedRegions).not.toContain('US');
    expect(byTitle('🌎Applied Scientist')).toMatchObject({ eligibilityType: 'worldwide', allowedRegions: [], locationRaw: 'Worldwide' });
  });

  it('maps seniority and USD salary to yearly; other currencies → null', () => {
    expect(byTitle('Full Stack Engineer')).toMatchObject({ seniority: 'mid', salaryMinUsd: 150_000, salaryMaxUsd: 200_000 });
    expect(byTitle('Campaign Coordinator')).toMatchObject({ seniority: 'junior', salaryMinUsd: 52_000, salaryMaxUsd: 72_800 });
    expect(byTitle('Senior Product Marketing')).toMatchObject({ seniority: 'lead', salaryMinUsd: null, salaryMaxUsd: null });
    expect(byTitle('Finance Director').seniority).toBe('lead');
  });

  it('keeps at most 8 tags and drops SEO-style ones', () => {
    for (const j of jobs) {
      expect(j!.tags.length).toBeLessThanOrEqual(8);
      expect(j!.tags.some((t) => /\b(?:jobs?|remote)\b/.test(t))).toBe(false);
    }
  });

  it('invalid items → null', () => {
    expect(normalizeHimalayasJob({ title: 'x' })).toBeNull();
    expect(normalizeHimalayasJob({ ...(himalayasPage.jobs[0] as object), applicationLink: 'not a url' })).toBeNull();
  });

  it('pages: feed by cursor, then the worldwide searches, sends the API key', async () => {
    const getJson = vi.fn(async (url: string, _headers?: Record<string, string>) => {
      return { ...himalayasPage, nextCursor: url.includes('cursor=') || url.includes('/search?') ? null : 'abc' };
    });
    const pages = await collect(himalayas.pages({ getJson, maxPages: 5, apiKey: 'k', log: silentLog }));
    expect(getJson.mock.calls.map((c) => c[0])).toEqual([
      'https://himalayas.app/jobs/api?limit=20',
      'https://himalayas.app/jobs/api?limit=20&cursor=abc',
      'https://himalayas.app/jobs/api/search?worldwide=true&sort=recent&q=engineer&page=1',
      'https://himalayas.app/jobs/api/search?worldwide=true&sort=recent&q=developer&page=1',
    ]);
    expect(getJson.mock.calls[0]![1]).toEqual({ authorization: 'Bearer k' });
    expect(pages.map((p) => p.stream)).toEqual(['feed', 'feed', 'worldwide:engineer', 'worldwide:developer']);
    expect(pages[0]).toMatchObject({ fetched: 7, invalid: 0 });

    const one = await collect(himalayas.pages({ getJson: async () => ({ ...himalayasPage }), maxPages: 1, log: silentLog }));
    expect(one).toHaveLength(1);
  });

  it('pages: searches each user country, never more than maxPages requests', async () => {
    const getJson = vi.fn(async () => ({ ...himalayasPage, nextCursor: null }));
    await collect(himalayas.pages({ getJson, maxPages: 5, countries: ['MA'], log: silentLog }));
    expect(getJson.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      'https://himalayas.app/jobs/api?limit=20',
      'https://himalayas.app/jobs/api/search?worldwide=true&sort=recent&q=engineer&page=1',
      'https://himalayas.app/jobs/api/search?worldwide=true&sort=recent&q=developer&page=1',
      'https://himalayas.app/jobs/api/search?country=MA&exclude_worldwide=true&sort=recent&q=engineer&page=1',
      'https://himalayas.app/jobs/api/search?country=MA&exclude_worldwide=true&sort=recent&q=developer&page=1',
    ]);
    const capped = vi.fn(async () => ({ ...himalayasPage, nextCursor: null }));
    await collect(himalayas.pages({ getJson: capped, maxPages: 3, countries: ['MA', 'FR'], log: silentLog }));
    expect(capped).toHaveBeenCalledTimes(3);
  });

  it('pages: a full search page leads to the next page unless that stream caught up', async () => {
    const full = { jobs: Array.from({ length: 20 }, (_, i) => himalayasPage.jobs[i % himalayasPage.jobs.length]) };
    const getJson = vi.fn(async () => full);
    await collect(himalayas.pages({ getJson, maxPages: 6, isCaughtUp: (s) => s === 'worldwide:engineer', log: silentLog }));
    const urls = getJson.mock.calls.map((c) => (c as unknown[])[0] as string);
    expect(urls.filter((u) => u.includes('q=engineer'))).toEqual(['https://himalayas.app/jobs/api/search?worldwide=true&sort=recent&q=engineer&page=1']);
    expect(urls.filter((u) => u.includes('q=developer'))).toHaveLength(2);
  });

  it('streams and page shares', () => {
    expect(himalayasStreams().map((s) => s.id)).toEqual(['feed', 'worldwide:engineer', 'worldwide:developer']);
    expect(himalayasStreams(['MA']).map((s) => s.id)).toEqual(['feed', 'worldwide:engineer', 'worldwide:developer', 'MA:engineer', 'MA:developer']);
    expect(pagesPerStream(6, 5)).toEqual({ feed: 2, search: 1 });
    expect(pagesPerStream(60, 5)).toEqual({ feed: 12, search: 12 });
    expect(pagesPerStream(2, 5)).toEqual({ feed: 1, search: 1 });
  });
});

describe('remoteok adapter', () => {
  it('skips the legal-notice element', async () => {
    const pages = await collect(remoteok.pages({ getJson: async () => remoteOkFeed, maxPages: 1, log: silentLog }));
    expect(pages).toHaveLength(1);
    expect(pages[0]!.fetched).toBe(remoteOkFeed.length - 1);
    expect(pages[0]!.jobs).toHaveLength(remoteOkFeed.length - 1);
  });

  const jobs = remoteOkFeed.slice(1).map(normalizeRemoteOkJob);
  const byTitle = (t: string) => jobs.find((j) => j?.title === t)!;

  it('normalizes ids, urls, dates and leaves eligibility to the rules', () => {
    const j = byTitle('Senior Frontend Engineer');
    expect(j).toMatchObject({
      sourceId: 'remoteok',
      sourceJobId: '1137562',
      url: 'https://remoteOK.com/remote-jobs/remote-senior-frontend-engineer-b2spin-1137562',
      company: 'B2spin',
      locationRaw: null,
      eligibilityType: null,
      seniority: 'senior',
    });
    expect(j.postedAt).toBe('2026-10-23T16:00:12.000Z');
  });

  it('repairs mojibake and decodes entities', () => {
    expect(byTitle('Technical Account Manager').locationRaw).toBe('Ciudad de México, Mexico');
    expect(byTitle('Travel Support Specialist').company).toBe('Aisles & Abroad');
    for (const j of jobs) expect(j!.description).not.toMatch(/â\u0080/);
  });

  it('salary 0 → null; real values kept as yearly USD', () => {
    expect(byTitle('Senior Frontend Engineer')).toMatchObject({ salaryMinUsd: null, salaryMaxUsd: null });
    expect(byTitle('Senior DevOps Engineer')).toMatchObject({ salaryMinUsd: 50_000, salaryMaxUsd: 150_000 });
  });

  it('drops noise tags that Remote OK puts on every post', () => {
    const tags = byTitle('Senior Frontend Engineer').tags;
    expect(tags).toContain('react');
    expect(tags).not.toContain('digital nomad');
    expect(tags).not.toContain('marketing');
  });
});

describe('jobicy adapter', () => {
  const page = fixture('jobicy.json') as { jobs: unknown[] };
  const jobs = page.jobs.map(normalizeJobicyJob);

  it('normalizes valid jobs and drops the broken one', () => {
    expect(jobs.slice(0, 3).every((j) => j !== null)).toBe(true);
    expect(jobs[3]).toBeNull();
  });

  it('keeps the Jobicy listing url (link-back and apply link) and leaves eligibility to the rules', () => {
    expect(jobs[0]).toMatchObject({
      sourceId: 'jobicy',
      sourceJobId: '154082',
      url: expect.stringMatching(/^https:\/\/jobicy\.com\/jobs\/154082-/),
      locationRaw: 'Anywhere',
      eligibilityType: null,
      seniority: 'senior',
    });
    expect(jobs[2]!.locationRaw).toBe('EMEA, LATAM, Canada, USA');
  });

  it('maps levels and converts USD salaries only', () => {
    expect(jobs[1]).toMatchObject({ seniority: 'lead', salaryMinUsd: 200_000 });
    expect(jobs[0]).toMatchObject({ salaryMinUsd: null, salaryMaxUsd: null });
  });

  it('jobicyLocation tidies the separators', () => {
    expect(jobicyLocation('Canada,  USA')).toBe('Canada, USA');
    expect(jobicyLocation('')).toBeNull();
  });

  it('reads one page per industry, at most JOBICY_PAGES_PER_RUN, newest first', async () => {
    const getJson = vi.fn(async (_url: string) => page);
    const pages = await collect(jobicy.pages({ getJson, maxPages: 6, log: silentLog }));
    expect(pages.map((p) => p.stream)).toEqual([...JOBICY_INDUSTRIES]);
    expect(getJson).toHaveBeenCalledTimes(JOBICY_PAGES_PER_RUN);
    expect(getJson.mock.calls[0]![0]).toBe('https://jobicy.com/api/jobs?count=50&industry=engineering');
    expect(pages[0]).toMatchObject({ fetched: 4, invalid: 1 });
    expect(await collect(jobicy.pages({ getJson, maxPages: 1, log: silentLog }))).toHaveLength(1);
  });

  it('the pipeline rules read Jobicy locations', () => {
    expect(classifyLocationRules({ locationRaw: jobs[0]!.locationRaw, description: '' }).eligibilityType).toBe('worldwide');
    expect(classifyLocationRules({ locationRaw: jobs[2]!.locationRaw, description: '' }).allowedRegions).toEqual(['EMEA', 'LATAM', 'CA', 'US']);
  });
});
