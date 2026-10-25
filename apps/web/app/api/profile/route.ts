import { embedTexts, profileEmbeddingText } from '@jobpilot/core/embed';
import { ProfileUpdateRequest, type ProfileLLM } from '@jobpilot/core/schemas';
import { embedDeps } from '@/lib/server/embed';
import { workAuthRegions } from '@/lib/server/profile';
import { getRequestContext } from '@/lib/server/env';
import { apiErrorResponse, badInput, describeZodError, INTERNAL_MESSAGE, logError, readJsonBody } from '@/lib/server/http';
import { supabaseAdmin } from '@/lib/server/supabase';
import { requireUser } from '@/lib/supabase/server';

// PUT /api/profile (docs/05-ARCHITECTURE.md §5.3, §8): saves the reviewed profile.
// cv_parsed, embedding and profile_version are server-only columns (02-DATABASE §6), so the row is
// written with the service role, filtered to the signed-in user's id.
//   regions   = expand(country) ∪ expand(each extra country) ∪ extra region codes
//   embedding = bge-base of profileEmbeddingText (same model and recipe as job embeddings)
//   version   = previous + 1 (analyses are cached per profile_version, so edits re-analyze)

export const dynamic = 'force-dynamic';

/** One-line summary of experience and projects for the embedding text. */
function profileSummary(p: ProfileLLM): string {
  const exp = p.experiences.slice(0, 6).map((e) => `${e.title}${e.org ? ` at ${e.org}` : ''}: ${e.summary}`);
  const proj = p.projects.slice(0, 6).map((x) => `${x.name}: ${x.summary}`);
  return [...exp, ...proj].join('. ');
}

export async function PUT(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const rc = await getRequestContext();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = ProfileUpdateRequest.safeParse(body.value);
  if (!parsed.success) return badInput(describeZodError(parsed.error));
  const p = parsed.data;

  const db = supabaseAdmin(rc.env);
  if (!db) {
    logError('config_missing', 'Supabase service role is not configured');
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }

  try {
    const [current] = await db.select<{ profile_version: number; onboarded_at: string | null }>(
      'profiles',
      `select=profile_version,onboarded_at&id=eq.${encodeURIComponent(auth.user.id)}`,
    );
    if (!current) return apiErrorResponse('not_found', 'Your profile was not found. Please sign in again.', 404);

    // A missing embedding only delays matching; the profile is still saved and can be re-embedded.
    let embedding: number[] | null = null;
    const deps = embedDeps(rc);
    if (deps) {
      try {
        const text = profileEmbeddingText({ targetRoles: p.targetRoles, skills: p.cvParsed.skills, summary: profileSummary(p.cvParsed) });
        [embedding = null] = await embedTexts([text], deps);
      } catch (err) {
        logError('profile_embed_failed', err);
      }
    }

    const profileVersion = current.profile_version + 1;
    await db.update('profiles', { id: auth.user.id }, {
      cv_text: p.cvText,
      cv_parsed: p.cvParsed,
      country_code: p.country,
      work_auth_regions: workAuthRegions(p.country, p.extraRegions),
      target_roles: p.targetRoles,
      seniority: p.seniority,
      salary_floor_usd: p.salaryFloorUsd,
      digest_opt_in: p.digestOptIn,
      profile_version: profileVersion,
      ...(embedding ? { embedding } : {}),
      ...(current.onboarded_at ? {} : { onboarded_at: new Date().toISOString() }),
      last_active_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, profileVersion, embedded: embedding !== null }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    logError('profile_save_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
}
