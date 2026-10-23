import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, insertJob, type TestDb } from './helpers';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t?.close();
});

/** unit-ish vector in dims 0/1: cosine similarity to e0 = cos(angle) */
const angled = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return t.vec({ 0: Math.cos(r), 1: Math.sin(r) });
};

const match = async (user: string, limit = 100) =>
  (
    await t.db.query<{ job_id: string; similarity: number }>(
      'select job_id, similarity from public.match_jobs($1, $2)',
      [user, limit],
    )
  ).rows;

async function moroccanUser(withEmbedding = true) {
  const u = await t.createUser();
  // country MA, work auth expanded in code (packages/core/regions.ts); MA itself
  // deliberately NOT in work_auth_regions to prove country_code is included too.
  await t.db.query(
    `update public.profiles
        set country_code = 'MA', work_auth_regions = '{AFRICA,EMEA,MENA}', embedding = $2::extensions.vector
      where id = $1`,
    [u, withEmbedding ? t.vec({ 0: 1 }) : null],
  );
  return u;
}

describe('match_jobs', () => {
  it('filters by eligibility and orders by similarity', async () => {
    const u = await moroccanUser();
    const worldwide = await insertJob(t, { title: 'worldwide', eligibilityType: 'worldwide', embedding: angled(30) });
    const unclear = await insertJob(t, { title: 'unclear', eligibilityType: 'unclear', embedding: angled(60) });
    const emea = await insertJob(t, {
      title: 'emea', eligibilityType: 'regions', allowedRegions: ['EMEA'], embedding: angled(10),
    });
    const maOnly = await insertJob(t, {
      title: 'ma', eligibilityType: 'regions', allowedRegions: ['MA'], embedding: angled(45),
    });
    const usOnly = await insertJob(t, {
      title: 'us', eligibilityType: 'regions', allowedRegions: ['US'], embedding: angled(0),
    });
    const euOnly = await insertJob(t, {
      title: 'eu', eligibilityType: 'regions', allowedRegions: ['EU', 'UK'], embedding: angled(5),
    });

    const rows = await match(u);
    const ids = rows.map((r) => r.job_id);
    expect(ids).toEqual([emea, worldwide, maOnly, unclear]); // 10° < 30° < 45° < 60°
    expect(ids).not.toContain(usOnly);
    expect(ids).not.toContain(euOnly);
    expect(rows[0]!.similarity).toBeCloseTo(Math.cos((10 * Math.PI) / 180), 4);
    // similarities are non-increasing
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.similarity).toBeLessThanOrEqual(rows[i - 1]!.similarity);

    expect((await match(u, 2)).map((r) => r.job_id)).toEqual([emea, worldwide]); // p_limit
  });

  it('excludes already-matched and already-tracked jobs, private, expired and un-embedded jobs', async () => {
    const u = await moroccanUser();
    const other = await t.createUser();
    const keep = await insertJob(t, { embedding: angled(20) });
    const matched = await insertJob(t, { embedding: angled(1) });
    const tracked = await insertJob(t, { embedding: angled(2) });
    const privateJob = await insertJob(t, { ownerId: other, embedding: angled(3) });
    const ownPrivate = await insertJob(t, { ownerId: u, embedding: angled(3) });
    const expired = await insertJob(t, { embedding: angled(4), expiresAt: new Date(Date.now() - 1000).toISOString() });
    const futureExpiry = await insertJob(t, {
      embedding: angled(25), expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const noEmbedding = await insertJob(t, { embedding: null });

    await t.db.query(
      `insert into public.daily_matches (user_id, job_id, match_date, similarity, rank)
       values ($1, $2, current_date - 1, 0.99, 1)`,
      [u, matched],
    );
    await t.db.query(`insert into public.applications (user_id, job_id) values ($1, $2)`, [u, tracked]);

    const ids = (await match(u)).map((r) => r.job_id);
    expect(ids).toContain(keep);
    expect(ids).toContain(futureExpiry);
    for (const excluded of [matched, tracked, privateJob, ownPrivate, expired, noEmbedding]) {
      expect(ids).not.toContain(excluded);
    }
    // a matched job for user u is still a candidate for another user
    const v = await moroccanUser();
    expect((await match(v)).map((r) => r.job_id)).toContain(matched);
  });

  it('returns nothing for a user without an embedding', async () => {
    const u = await moroccanUser(false);
    await insertJob(t, { embedding: angled(0) });
    expect(await match(u)).toEqual([]);
  });

  it('is callable by service_role only', async () => {
    const u = await moroccanUser();
    await expect(t.as('authenticated', u, () => match(u))).rejects.toThrow(/permission denied/);
    await expect(t.as('anon', null, () => match(u))).rejects.toThrow(/permission denied/);
    expect((await t.as('service_role', null, () => match(u))).length).toBeGreaterThan(0);
  });

  it('HNSW index serves a nearest-neighbour query (real pgvector only)', async (ctx) => {
    if (!t.realVector) ctx.skip();
    await t.db.exec('set enable_seqscan = off');
    try {
      const { rows } = await t.db.query<{ 'QUERY PLAN': string }>(
        `explain select id from public.jobs order by embedding operator(extensions.<=>) $1::extensions.vector limit 5`,
        [t.vec({ 0: 1 })],
      );
      expect(rows.map((r) => r['QUERY PLAN']).join('\n')).toMatch(/jobs_embedding_idx/);
    } finally {
      await t.db.exec('reset enable_seqscan');
    }
  });
});
