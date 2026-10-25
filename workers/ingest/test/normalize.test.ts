import { describe, expect, it, vi } from 'vitest';
import { createGetJson, SourceHttpError } from '../src/http';
import { verifyLocationAnswer } from '../src/location-llm';
import { cleanLine, fixMojibake, maxSeniority, seniorityFromTitle, yearlyUsd } from '../src/normalize';

describe('fixMojibake', () => {
  it('repairs UTF-8 read as Latin-1, leaves good text alone', () => {
    expect(fixMojibake('Ciudad de MÃ©xico')).toBe('Ciudad de México');
    expect(fixMojibake('Itâ\u0080\u0099s great')).toBe('It’s great');
    expect(fixMojibake('Café déjà vu')).toBe('Café déjà vu');
    expect(fixMojibake('plain ascii')).toBe('plain ascii');
  });

  it('cleanLine decodes entities and collapses whitespace', () => {
    expect(cleanLine('Aisles &amp; Abroad ')).toBe('Aisles & Abroad');
    expect(cleanLine('')).toBeNull();
    expect(cleanLine(null)).toBeNull();
  });
});

describe('seniority', () => {
  it.each([
    ['Software Engineering Intern', 'intern'],
    ['Junior Data Engineer', 'junior'],
    ['Jr. Frontend Developer', 'junior'],
    ['Senior Backend Engineer', 'senior'],
    ['Sr. DevOps Engineer', 'senior'],
    ['Staff Engineer', 'lead'],
    ['Engineering Manager', 'lead'],
    ['Full Stack Engineer', null],
  ] as const)('%s → %s', (title, want) => {
    expect(seniorityFromTitle(title)).toBe(want);
  });

  it('maxSeniority picks the highest', () => {
    expect(maxSeniority(['senior', 'lead', null])).toBe('lead');
    expect(maxSeniority([null])).toBeNull();
  });
});

describe('yearlyUsd', () => {
  it('converts periods, swaps reversed ranges, rejects junk and non-USD', () => {
    expect(yearlyUsd(150_000, 200_000, 'USD', 'annual')).toEqual({ salaryMinUsd: 150_000, salaryMaxUsd: 200_000 });
    expect(yearlyUsd(50, 75, 'usd', 'hourly')).toEqual({ salaryMinUsd: 104_000, salaryMaxUsd: 156_000 });
    expect(yearlyUsd(8_000, 6_000, 'USD', 'monthly')).toEqual({ salaryMinUsd: 72_000, salaryMaxUsd: 96_000 });
    expect(yearlyUsd(0, 0, 'USD')).toEqual({ salaryMinUsd: null, salaryMaxUsd: null });
    expect(yearlyUsd(1e9, null, 'USD')).toEqual({ salaryMinUsd: null, salaryMaxUsd: null });
    expect(yearlyUsd(80_000, 90_000, 'EUR')).toEqual({ salaryMinUsd: null, salaryMaxUsd: null });
    expect(yearlyUsd(80_000, 90_000, null)).toEqual({ salaryMinUsd: null, salaryMaxUsd: null });
  });
});

describe('createGetJson (polite fetch)', () => {
  it('sends our User-Agent and waits between requests', async () => {
    let t = 0;
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{"ok":true}', { status: 200 }));
    const getJson = createGetJson({ userAgent: 'ApplyVerdictBot/0.1 (+https://x.test)', fetch, sleep, now: () => t, minIntervalMs: 1000 });
    await getJson('https://a.test/1');
    await getJson('https://a.test/2');
    expect(sleep).toHaveBeenCalledWith(1000);
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['user-agent']).toBe('ApplyVerdictBot/0.1 (+https://x.test)');
  });

  it('retries once on 429 honoring Retry-After, then throws on a 4xx', async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const fetch = vi.fn(async () => (calls++ === 0 ? new Response('', { status: 429, headers: { 'retry-after': '2' } }) : new Response('[]')));
    await expect(createGetJson({ userAgent: 'u', fetch, sleep, minIntervalMs: 0 })('https://a.test/')).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(2000);

    const notFound = vi.fn(async () => new Response('', { status: 404 }));
    await expect(createGetJson({ userAgent: 'u', fetch: notFound, sleep, minIntervalMs: 0 })('https://a.test/x')).rejects.toBeInstanceOf(SourceHttpError);
  });
});

describe('verifyLocationAnswer (LLM fallback guard)', () => {
  const posting = 'Title: Backend Engineer\nLocation field: Remote\n\nYou must be based in Canada or the US to apply.';

  it('accepts a verbatim quote with valid codes', () => {
    expect(verifyLocationAnswer({ eligibilityType: 'regions', allowedRegions: ['ca', 'US', 'XX1'], quote: 'You must be based in Canada or the US' }, posting)).toEqual({
      eligibilityType: 'regions',
      allowedRegions: ['CA', 'US'],
      quote: 'You must be based in Canada or the US',
    });
  });

  it('a quote not in the posting → unclear', () => {
    expect(verifyLocationAnswer({ eligibilityType: 'worldwide', allowedRegions: [], quote: 'Open to everyone worldwide' }, posting).eligibilityType).toBe('unclear');
  });

  it('regions without a valid code → unclear; UK → GB', () => {
    expect(verifyLocationAnswer({ eligibilityType: 'regions', allowedRegions: ['Mars'], quote: 'based in Canada' }, posting).eligibilityType).toBe('unclear');
    expect(verifyLocationAnswer({ eligibilityType: 'regions', allowedRegions: ['UK'], quote: 'based in Canada' }, posting).allowedRegions).toEqual(['GB']);
  });
});
