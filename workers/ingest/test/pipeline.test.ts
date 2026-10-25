import { readFileSync } from 'node:fs';
import { jobContentHash } from '@jobpilot/core/jobs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../src/db';
import { silentLog } from '../src/log';
import { runIngest, runSource, type PipelineDeps } from '../src/pipeline';
import { himalayas } from '../src/sources/himalayas';
import { remoteok } from '../src/sources/remoteok';

// The LLM fallback is mocked: these tests check the pipeline's budget and wiring, not Gemini.
const llmMock = vi.hoisted(() => ({ classifyLocationLLM: vi.fn() }));
vi.mock('../src/location-llm', () => llmMock);

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const himalayasPage = { ...(fixture('himalayas.json') as { jobs: unknown[] }), nextCursor: null };
const remoteOkFeed = fixture('remoteok.json');

const vec = Array.from({ length: 768 }, (_, i) => i / 768);

interface FakeWorld {
  existing: Set<string>;
  upserts: Array<Record<string, unknown>>;
  patches: Array<{ url: string; body: Record<string, unknown> }>;
  requests: Array<{ url: string; method: string; headers: Record<string, string> }>;
  failUpsertOnce?: boolean;
}

function fakeFetch(world: FakeWorld): typeof fetch {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    world.requests.push({ url, method, headers: (init.headers ?? {}) as Record<string, string> });
    if (url.startsWith('https://himalayas.app/jobs/api')) return Response.json(himalayasPage);
    if (url === 'https://remoteok.com/api') return Response.json(remoteOkFeed);
    if (url.startsWith('https://api.cloudflare.com/')) {
      const { text } = JSON.parse(String(init.body)) as { text: string[] };
      return Response.json({ success: true, result: { shape: [text.length, 768], data: text.map(() => vec) } });
    }
    if (url.startsWith('https://db.test/rest/v1/jobs?select=content_hash')) {
      const list = decodeURIComponent(url).match(/content_hash=in\.\(([^)]*)\)/)![1]!.split(',');
      return Response.json(list.filter((h) => world.existing.has(h)).map((h) => ({ content_hash: h })));
    }
    if (url.startsWith('https://db.test/rest/v1/jobs?on_conflict=') && method === 'POST') {
      const rows = JSON.parse(String(init.body)) as Array<Record<string, unknown>>;
      if (world.failUpsertOnce && rows.length > 1) {
        world.failUpsertOnce = false;
        return new Response('{"code":"23505"}', { status: 409 });
      }
      world.upserts.push(...rows);
      return new Response(null, { status: 201 });
    }
    if (url.startsWith('https://db.test/rest/v1/sources?id=eq.') && method === 'PATCH') {
      world.patches.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 204 });
    }
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;
}

function deps(world: FakeWorld, overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const fetch = fakeFetch(world);
  return {
    db: createDb({ url: 'https://db.test', serviceRoleKey: 'service-key', fetch }),
    embed: { accountId: 'acc', apiToken: 'tok', fetch },
    llm: null,
    fetch,
    userAgent: 'ApplyVerdictBot/0.1 (+https://app.test)',
    log: silentLog,
    sleep: async () => {},
    now: () => new Date('2026-10-25T12:00:00Z'),
    ...overrides,
  };
}

const world = (): FakeWorld => ({ existing: new Set(), upserts: [], patches: [], requests: [] });

beforeEach(() => llmMock.classifyLocationLLM.mockReset());

describe('runSource', () => {
  it('writes only new tech jobs, with hash, eligibility and a 768-d vector', async () => {
    const w = world();
    const stats = await runSource(himalayas, deps(w), { dryRun: false, maxPages: 3, llmCap: 0 });
    expect(stats).toMatchObject({ ok: true, pages: 1, fetched: 7, tech: 3, fresh: 3, upserted: 3, embedded: 3 });
    expect(w.upserts.map((r) => r.title).sort()).toEqual(['Full Stack Engineer', 'Talent Database - Sr. AI Engineer - India Only', '🌎Applied Scientist, Remote- Contract']);
    const row = w.upserts.find((r) => r.title === 'Full Stack Engineer')!;
    expect(row).toMatchObject({ source_id: 'himalayas', owner_id: null, eligibility_type: 'regions', allowed_regions: ['US'] });
    expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(String(row.embedding).slice(1, -1).split(',')).toHaveLength(768);
    // every job-source request carries our User-Agent; the upsert asks PostgREST to merge
    const src = w.requests.find((r) => r.url.startsWith('https://himalayas.app'))!;
    expect(src.headers['user-agent']).toBe('ApplyVerdictBot/0.1 (+https://app.test)');
    const up = w.requests.find((r) => r.method === 'POST' && r.url.includes('on_conflict=source_id,source_job_id'))!;
    expect(up.headers.prefer).toBe('resolution=merge-duplicates,return=minimal');
  });

  it('skips jobs whose hash already exists among public jobs', async () => {
    const w = world();
    w.existing.add(await jobContentHash({ company: 'Dante', title: 'Full Stack Engineer', description: (await firstDescription('Full Stack Engineer'))! }));
    const stats = await runSource(himalayas, deps(w), { dryRun: false, maxPages: 1, llmCap: 0 });
    expect(stats.duplicates).toBe(1);
    expect(stats.upserted).toBe(2);
    expect(w.upserts.some((r) => r.title === 'Full Stack Engineer')).toBe(false);
  });

  it('records last_run_at / last_status on the source', async () => {
    const w = world();
    await runSource(remoteok, deps(w), { dryRun: false, maxPages: 1, llmCap: 0 });
    expect(w.patches).toHaveLength(1);
    expect(w.patches[0]!.url).toBe('https://db.test/rest/v1/sources?id=eq.remoteok');
    expect(w.patches[0]!.body).toEqual({ last_run_at: '2026-10-25T12:00:00.000Z', last_status: 'ok: fetched 7, tech 2, new 2, upserted 2' });
  });

  it('dry run: counts and samples, no LLM, no embeddings, no writes', async () => {
    const w = world();
    llmMock.classifyLocationLLM.mockResolvedValue({ eligibilityType: 'worldwide', allowedRegions: [], quote: 'x' });
    const stats = await runSource(remoteok, deps(w, { llm: { gemini: { apiKey: 'k' } } }), { dryRun: true, maxPages: 1, llmCap: 5 });
    expect(stats).toMatchObject({ ok: true, tech: 2, fresh: 2, upserted: 0, embedded: 0, llmTried: 0 });
    expect(stats.samples).toHaveLength(2);
    expect(stats.eligibility.unclear).toBe(2);
    expect(w.requests.filter((r) => r.method !== 'GET')).toEqual([]);
    expect(w.requests.some((r) => r.url.startsWith('https://api.cloudflare.com'))).toBe(false);
    expect(llmMock.classifyLocationLLM).not.toHaveBeenCalled();
  });

  it('LLM fallback only for unclear jobs, within the cap shared across sources', async () => {
    const w = world();
    llmMock.classifyLocationLLM.mockResolvedValue({ eligibilityType: 'regions', allowedRegions: ['US'], quote: 'US only' });
    const stats = await runIngest([himalayas, remoteok], deps(w, { llm: { gemini: { apiKey: 'k' } } }), { dryRun: false, maxPages: 1, llmCap: 1 });
    // Himalayas jobs arrive classified; Remote OK has 2 unclear jobs but the cap is 1.
    expect(stats[0]!.llmTried).toBe(0);
    expect(stats[1]).toMatchObject({ llmTried: 1, llmResolved: 1 });
    expect(stats[1]!.eligibility).toEqual({ worldwide: 0, regions: 1, unclear: 1 });
    const resolved = w.upserts.find((r) => r.source_id === 'remoteok' && r.eligibility_type === 'regions')!;
    expect(resolved).toMatchObject({ allowed_regions: ['US'], eligibility_quote: 'US only' });
  });

  it('a failing chunk is retried row by row', async () => {
    const w = world();
    w.failUpsertOnce = true;
    const stats = await runSource(himalayas, deps(w), { dryRun: false, maxPages: 1, llmCap: 0 });
    expect(stats).toMatchObject({ ok: true, upserted: 3, failedRows: 0 });
  });

  it('respects --limit and refuses a real run without DB/embeddings', async () => {
    const w = world();
    expect((await runSource(himalayas, deps(w), { dryRun: false, maxPages: 1, llmCap: 0, limit: 1 })).upserted).toBe(1);
    const refused = await runSource(himalayas, deps(w, { embed: null }), { dryRun: false, maxPages: 1, llmCap: 0 });
    expect(refused).toMatchObject({ ok: false, error: 'a real run needs a DB and embeddings' });
  });

  it('a source error is reported, not thrown', async () => {
    const w = world();
    const broken = (async () => new Response('down', { status: 502 })) as typeof fetch;
    const stats = await runSource(himalayas, deps(w, { fetch: broken }), { dryRun: false, maxPages: 1, llmCap: 0 });
    expect(stats.ok).toBe(false);
    expect(stats.error).toMatch(/502/);
    expect(w.patches[0]!.body.last_status).toMatch(/^error: /);
  });
});

async function firstDescription(title: string): Promise<string | undefined> {
  const { normalizeHimalayasJob } = await import('../src/sources/himalayas');
  return himalayasPage.jobs.map(normalizeHimalayasJob).find((j) => j?.title === title)?.description;
}
