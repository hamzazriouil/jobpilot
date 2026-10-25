import type { WorkersAiBinding } from '../llm/providers';
import { EMBEDDING_DIMS } from '../schemas/job';

// Embeddings (docs/09-PHASE1-CONTRACT.md §4): built by W13 Ingest, reused by W11 Onboarding.
// Job and profile vectors must come from the same model AND the same text recipe, or the cosine
// similarity in `match_jobs` is meaningless. So both recipes live here, next to each other.

export const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5'; // 768 dims = EMBEDDING_DIMS
/** Workers AI accepts up to 100 texts per call; 50 keeps each request small. */
export const EMBED_BATCH_SIZE = 50;
/**
 * bge-base reads at most 512 tokens. ~1,800 chars of English stays under that with room for
 * code-heavy text (more tokens per char), and keeps the neuron cost per job predictable (§16).
 */
export const EMBED_MAX_CHARS = 1_800;
export const EMBED_TIMEOUT_MS = 30_000;
const RECIPE_WORDS = 400;

export type EmbedDeps =
  | { binding: WorkersAiBinding } // production (AI binding)
  | { accountId: string; apiToken: string; fetch?: typeof fetch }; // local scripts / next dev (REST)

export class EmbedError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'EmbedError';
  }
}

/** Cuts at a word break so the model never sees half a word. Empty input becomes a single space. */
export function truncateForEmbedding(text: string, max = EMBED_MAX_CHARS): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return ' ';
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const space = head.lastIndexOf(' ');
  return space > max * 0.8 ? head.slice(0, space) : head;
}

interface EmbedResult {
  shape?: number[];
  data?: number[][];
}

async function runBinding(binding: WorkersAiBinding, text: string[]): Promise<EmbedResult> {
  // WorkersAiBinding is structural (core doesn't depend on the ambient `Ai` type), hence the cast.
  const run = binding.run as unknown as (model: string, input: { text: string[] }) => Promise<EmbedResult>;
  return run.call(binding, EMBED_MODEL, { text });
}

async function runRest(
  deps: { accountId: string; apiToken: string; fetch?: typeof fetch },
  text: string[],
): Promise<EmbedResult> {
  const fetchImpl = deps.fetch ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(deps.accountId)}/ai/run/${EMBED_MODEL}`;
  let lastStatus: number | null = null;
  // One retry on 429/5xx: the free allowance is shared, short spikes happen.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1_500));
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${deps.apiToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
      });
    } catch (err) {
      if (attempt === 0) continue;
      throw new EmbedError(`Workers AI request failed: ${String(err)}`);
    }
    if (res.ok) {
      const body = (await res.json()) as { success?: boolean; result?: EmbedResult };
      if (body.success === false || !body.result) throw new EmbedError('Workers AI returned no result', res.status);
      return body.result;
    }
    lastStatus = res.status;
    // Error bodies hold codes/messages, never our token; cap them anyway.
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    if (res.status !== 429 && res.status < 500) throw new EmbedError(`Workers AI ${res.status}: ${detail}`, res.status);
  }
  throw new EmbedError(`Workers AI ${lastStatus ?? 'error'} after retry`, lastStatus);
}

/** Embeds `texts` in order, in batches of EMBED_BATCH_SIZE, each input truncated. Every vector is checked to be 768-d. */
export async function embedTexts(texts: string[], deps: EmbedDeps): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE).map((t) => truncateForEmbedding(t));
    const result = 'binding' in deps ? await runBinding(deps.binding, batch) : await runRest(deps, batch);
    const data = result.data;
    if (!Array.isArray(data) || data.length !== batch.length) {
      throw new EmbedError(`expected ${batch.length} vectors, got ${Array.isArray(data) ? data.length : 'none'}`);
    }
    for (const v of data) {
      if (!Array.isArray(v) || v.length !== EMBEDDING_DIMS || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
        throw new EmbedError(`expected ${EMBEDDING_DIMS}-dim vectors from ${EMBED_MODEL}`);
      }
      out.push(v);
    }
  }
  return out;
}

function firstWords(text: string, n: number): string {
  return text.split(/\s+/).filter(Boolean).slice(0, n).join(' ');
}

/** Shared shape of both recipes: what the role is, the skills, then free text. */
function recipe(roleLine: string, skills: string[], body: string): string {
  const lines = [roleLine.trim()];
  const s = skills.map((x) => x.trim()).filter(Boolean);
  if (s.length) lines.push(`Skills: ${s.join(', ')}`);
  const b = firstWords(body, RECIPE_WORDS);
  if (b) lines.push(b);
  return lines.join('\n');
}

/** title + tags + first 400 words of the description. */
export function jobEmbeddingText(job: { title: string; tags: string[]; description: string }): string {
  return recipe(job.title, job.tags, job.description);
}

/** target roles + skills + first 400 words of the summary (same layout as jobEmbeddingText). */
export function profileEmbeddingText(p: { targetRoles: string[]; skills: string[]; summary: string }): string {
  return recipe(p.targetRoles.join(', '), p.skills, p.summary);
}
