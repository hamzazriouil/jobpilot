import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './helpers';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t?.close();
});

describe('migration + seed', () => {
  it('applies cleanly and seeds the sources', async () => {
    const { rows } = await t.db.query<{ id: string; enabled: boolean }>(
      'select id, enabled from public.sources order by id',
    );
    expect(rows.map((r) => r.id).sort()).toEqual([
      'arbeitnow', 'himalayas', 'hn', 'jobicy', 'remoteok', 'remotive', 'user_paste', 'wwr',
    ]);
    // Feed sources are enabled only after their terms were read (docs/10-SOURCES.md).
    expect(rows.filter((r) => r.enabled).map((r) => r.id)).toEqual(['himalayas', 'jobicy', 'remoteok', 'user_paste']);
  });

  it('seed is idempotent', async () => {
    const { SEED } = await import('./helpers');
    await t.db.exec(SEED);
    const { rows } = await t.db.query<{ n: number }>('select count(*)::int n from public.sources');
    expect(rows[0]!.n).toBe(8);
  });

  it('enables RLS on every public table', async () => {
    const { rows } = await t.db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(rows).toHaveLength(15);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  it('pins search_path on every public function', async () => {
    const { rows } = await t.db.query<{ proname: string; proconfig: string[] | null }>(
      `select p.proname, p.proconfig from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of rows) expect(r.proconfig, r.proname).toContain('search_path=""');
  });

  it('creates the HNSW index (real pgvector only)', async (ctx) => {
    if (!t.realVector) ctx.skip();
    const { rows } = await t.db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'jobs_embedding_idx'`,
    );
    expect(rows[0]?.indexdef).toMatch(/USING hnsw \(embedding extensions\.vector_cosine_ops\)/);
  });
});

describe('auth.users -> profiles trigger', () => {
  it('creates a profile using full_name', async () => {
    const id = await t.createUser({ email: 'ada@example.com', meta: { full_name: 'Ada Lovelace' } });
    const { rows } = await t.db.query<{ display_name: string; profile_version: number }>(
      'select display_name, profile_version from public.profiles where id = $1',
      [id],
    );
    expect(rows).toEqual([{ display_name: 'Ada Lovelace', profile_version: 1 }]);
  });

  it("falls back to Google's `name`, then the email local part", async () => {
    const g = await t.createUser({ email: 'g@example.com', meta: { name: 'Grace Hopper' } });
    const e = await t.createUser({ email: 'linus@example.com' });
    const { rows } = await t.db.query<{ id: string; display_name: string }>(
      'select id, display_name from public.profiles where id = any($1)',
      [[g, e]],
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.display_name]));
    expect(byId[g]).toBe('Grace Hopper');
    expect(byId[e]).toBe('linus');
  });

  it('deleting the auth user cascades to the profile', async () => {
    const id = await t.createUser();
    await t.db.query('delete from auth.users where id = $1', [id]);
    const { rows } = await t.db.query('select 1 from public.profiles where id = $1', [id]);
    expect(rows).toHaveLength(0);
  });

  it('maintains profiles.updated_at', async () => {
    const id = await t.createUser();
    await t.db.query(`update public.profiles set updated_at = now() - interval '1 day' where id = $1`, [id]);
    // the trigger overwrites any value with now()
    const { rows } = await t.db.query<{ fresh: boolean }>(
      `select updated_at > now() - interval '1 minute' as fresh from public.profiles where id = $1`,
      [id],
    );
    expect(rows[0]!.fresh).toBe(true);
  });
});
