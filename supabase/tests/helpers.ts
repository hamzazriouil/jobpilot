import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite, type Extension } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const read = (rel: string) => readFileSync(join(pkgRoot, rel), 'utf8');

export const MIGRATION = read('migrations/0001_init.sql');
export const SEED = read('seed.sql');
const SHIM = read('tests/supabase-shim.sql');
const VECTOR_FALLBACK = read('tests/vector-fallback.sql');

export const DIM = 768;
export type Role = 'anon' | 'authenticated' | 'service_role';

/**
 * PGlite 0.5 ships pgvector as a separate package (@electric-sql/pglite-pgvector).
 * Resolution order: the package (if installed) -> PGLITE_PGVECTOR_DIR (a folder
 * containing vector.tar.gz) -> null (emulated vector type, see vector-fallback.sql).
 */
async function loadPgvector(): Promise<Extension | null> {
  const pkg = '@electric-sql/pglite-pgvector';
  try {
    const mod = (await import(/* @vite-ignore */ pkg)) as { vector?: Extension };
    if (mod.vector) return mod.vector;
  } catch {
    /* not installed */
  }
  const dir = process.env.PGLITE_PGVECTOR_DIR;
  if (dir) {
    const bundle = join(dir, 'vector.tar.gz');
    if (existsSync(bundle)) {
      return {
        name: 'vector',
        setup: async (_pg: unknown, emscriptenOpts: unknown) => ({
          emscriptenOpts,
          bundlePath: pathToFileURL(bundle),
        }),
      } as unknown as Extension;
    }
  }
  return null;
}

/** Rewrites the migration for the emulated vector type (no pgvector available). */
function adaptMigrationForFallback(sql: string): string {
  const out = sql
    .replace(/create extension if not exists vector with schema extensions;/, '')
    .replace(/extensions\.vector\(768\)/g, 'extensions.vector')
    .replace(/create index jobs_embedding_idx[^;]*;/, '');
  if (/extensions\.vector\(|using hnsw|create extension if not exists vector/.test(out)) {
    throw new Error('vector fallback rewrite did not apply; update adaptMigrationForFallback');
  }
  return out;
}

export interface TestDb {
  db: PGlite;
  /** true when running on the real pgvector extension */
  realVector: boolean;
  /** 768-dim vector literal; `values` maps dimension index -> value, rest are 0 */
  vec(values: Record<number, number>): string;
  /** run `fn` as an API role with auth.uid() = sub (like PostgREST does) */
  as<T>(role: Role, sub: string | null, fn: () => Promise<T>): Promise<T>;
  /** insert into auth.users (fires the profile trigger); returns the id */
  createUser(opts?: { email?: string; meta?: Record<string, unknown> }): Promise<string>;
  close(): Promise<void>;
}

let warned = false;

export async function createTestDb(): Promise<TestDb> {
  const vector = await loadPgvector();
  if (!vector && !warned) {
    warned = true;
    console.warn(
      '[db tests] pgvector for PGlite not found: using the emulated vector type. ' +
        'Install @electric-sql/pglite-pgvector (dev) or set PGLITE_PGVECTOR_DIR to test the real extension.',
    );
  }
  const db = await PGlite.create({ extensions: vector ? { vector } : {} });

  await db.exec(SHIM);
  if (vector) {
    await db.exec(MIGRATION);
  } else {
    await db.exec(VECTOR_FALLBACK);
    await db.exec(adaptMigrationForFallback(MIGRATION));
  }
  await db.exec(SEED);

  const vec = (values: Record<number, number>) => {
    const arr = new Array<number>(DIM).fill(0);
    for (const [k, v] of Object.entries(values)) arr[Number(k)] = v;
    return vector ? `[${arr.join(',')}]` : `{${arr.join(',')}}`;
  };

  const as = async <T>(role: Role, sub: string | null, fn: () => Promise<T>): Promise<T> => {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub ?? '']);
    await db.exec(`set role ${role}`);
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  };

  const createUser = async (opts: { email?: string; meta?: Record<string, unknown> } = {}) => {
    const res = await db.query<{ id: string }>(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), $1, $2::jsonb) returning id`,
      [opts.email ?? `u${Math.random().toString(36).slice(2, 10)}@example.com`, JSON.stringify(opts.meta ?? {})],
    );
    return res.rows[0]!.id;
  };

  return { db, realVector: !!vector, vec, as, createUser, close: () => db.close() };
}

/** Insert a public or private job as the table owner; returns its id. */
export async function insertJob(
  t: TestDb,
  job: {
    title?: string;
    ownerId?: string | null;
    eligibilityType?: 'worldwide' | 'regions' | 'unclear' | null;
    allowedRegions?: string[];
    embedding?: string | null;
    expiresAt?: string | null;
    postedAt?: string | null;
  } = {},
): Promise<string> {
  const res = await t.db.query<{ id: string }>(
    `insert into public.jobs (source_id, title, description, content_hash, owner_id,
                              eligibility_type, allowed_regions, embedding, expires_at, posted_at)
     values ($1, $2, 'desc', $3, $4, $5, $6, $7::extensions.vector, $8, $9)
     returning id`,
    [
      job.ownerId ? 'user_paste' : 'remoteok',
      job.title ?? 'Engineer',
      `hash-${Math.random().toString(36).slice(2)}`,
      job.ownerId ?? null,
      job.eligibilityType === undefined ? 'worldwide' : job.eligibilityType,
      job.allowedRegions ?? [],
      job.embedding ?? null,
      job.expiresAt ?? null,
      job.postedAt ?? null,
    ],
  );
  return res.rows[0]!.id;
}

/** Insert a minimal analysis row as the table owner; returns its id. */
export async function insertAnalysis(t: TestDb, userId: string, jobId: string): Promise<string> {
  const res = await t.db.query<{ id: string }>(
    `insert into public.analyses (user_id, job_id, profile_version, eligibility, eligibility_detail,
                                  requirements, score, band, provider, model, prompt_version)
     values ($1, $2, 1, 'eligible', '{}', '[]', 80, 'good', 'test', 'test-model', 'v1')
     returning id`,
    [userId, jobId],
  );
  return res.rows[0]!.id;
}
