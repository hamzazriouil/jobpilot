import { describe, expect, it, vi } from 'vitest';
import {
  EMBED_BATCH_SIZE,
  EMBED_MAX_CHARS,
  EMBED_MODEL,
  EmbedError,
  embedTexts,
  jobEmbeddingText,
  profileEmbeddingText,
  truncateForEmbedding,
} from './index';

const vec = (seed: number) => Array.from({ length: 768 }, (_, i) => (seed + i) / 1000);

function fakeRest(handler: (body: { text: string[] }, call: number) => Response) {
  let call = 0;
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => handler(JSON.parse(String(init!.body)), call++));
}

const ok = (texts: string[]) =>
  new Response(JSON.stringify({ success: true, result: { shape: [texts.length, 768], data: texts.map((_, i) => vec(i)) } }), {
    status: 200,
  });

describe('embedTexts (REST)', () => {
  it('posts to the bge model URL with the token and returns vectors in order', async () => {
    const fetch = fakeRest((b) => ok(b.text));
    const out = await embedTexts(['a', 'b'], { accountId: 'acc', apiToken: 'tok', fetch });
    expect(out).toHaveLength(2);
    expect(out[1]![0]).toBeCloseTo(0.001);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(`https://api.cloudflare.com/client/v4/accounts/acc/ai/run/${EMBED_MODEL}`);
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it(`batches by ${EMBED_BATCH_SIZE} and truncates long inputs`, async () => {
    const seen: string[][] = [];
    const fetch = fakeRest((b) => {
      seen.push(b.text);
      return ok(b.text);
    });
    const texts = Array.from({ length: 120 }, (_, i) => `job ${i} ${'word '.repeat(1000)}`);
    const out = await embedTexts(texts, { accountId: 'acc', apiToken: 'tok', fetch });
    expect(out).toHaveLength(120);
    expect(seen.map((s) => s.length)).toEqual([50, 50, 20]);
    expect(Math.max(...seen.flat().map((t) => t.length))).toBeLessThanOrEqual(EMBED_MAX_CHARS);
  });

  it('retries once on 429, then succeeds', async () => {
    const fetch = fakeRest((b, call) => (call === 0 ? new Response('busy', { status: 429 }) : ok(b.text)));
    await expect(embedTexts(['a'], { accountId: 'acc', apiToken: 'tok', fetch })).resolves.toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 401 and reports the status', async () => {
    const fetch = fakeRest(() => new Response('{"errors":[{"message":"bad token"}]}', { status: 401 }));
    const err = await embedTexts(['a'], { accountId: 'acc', apiToken: 'tok', fetch }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmbedError);
    expect((err as EmbedError).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects vectors that are not 768-d', async () => {
    const fetch = fakeRest(() => new Response(JSON.stringify({ success: true, result: { data: [[1, 2, 3]] } })));
    await expect(embedTexts(['a'], { accountId: 'acc', apiToken: 'tok', fetch })).rejects.toThrow(/768/);
  });

  it('rejects a count mismatch', async () => {
    const fetch = fakeRest(() => new Response(JSON.stringify({ success: true, result: { data: [vec(1)] } })));
    await expect(embedTexts(['a', 'b'], { accountId: 'acc', apiToken: 'tok', fetch })).rejects.toThrow(/expected 2 vectors/);
  });
});

describe('embedTexts (binding)', () => {
  it('calls env.AI.run with the model and { text }', async () => {
    const run = vi.fn(async (_model: string, input: { text: string[] }) => ({ shape: [input.text.length, 768], data: input.text.map((_, i) => vec(i)) }));
    const out = await embedTexts(['x', 'y', 'z'], { binding: { run } as never });
    expect(out).toHaveLength(3);
    expect(run).toHaveBeenCalledWith(EMBED_MODEL, { text: ['x', 'y', 'z'] });
  });

  it('empty input list makes no call', async () => {
    const run = vi.fn();
    await expect(embedTexts([], { binding: { run } as never })).resolves.toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('embedding text recipes', () => {
  it('truncateForEmbedding cuts at a word break and never returns empty', () => {
    expect(truncateForEmbedding('')).toBe(' ');
    const t = truncateForEmbedding('abcdefghi '.repeat(400));
    expect(t.length).toBeLessThanOrEqual(EMBED_MAX_CHARS);
    expect(t.endsWith('abcdefghi')).toBe(true);
  });

  it('job: title, tags, then the first 400 words', () => {
    const text = jobEmbeddingText({ title: 'Senior Go Engineer', tags: ['go', 'postgres'], description: 'w '.repeat(600) });
    const [title, skills, body] = text.split('\n');
    expect(title).toBe('Senior Go Engineer');
    expect(skills).toBe('Skills: go, postgres');
    expect(body!.split(' ')).toHaveLength(400);
  });

  it('profile uses the same layout, so the vectors are comparable', () => {
    const p = profileEmbeddingText({ targetRoles: ['Backend Engineer', 'AI Engineer'], skills: ['Python'], summary: 'Built RAG systems.' });
    expect(p).toBe('Backend Engineer, AI Engineer\nSkills: Python\nBuilt RAG systems.');
    expect(jobEmbeddingText({ title: 'AI Engineer', tags: [], description: '' })).toBe('AI Engineer');
  });
});
