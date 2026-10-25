import { runLLM, type LlmObjectStreamResult } from '@jobpilot/core/llm';
import { draftCall, finishDrafts, type DraftsLLMUncapped } from '@jobpilot/core/pipeline';
import { DRAFT_PROMPT_VERSION } from '@jobpilot/core/prompts';
import type { DraftResultEvent } from '@jobpilot/core/schemas';
import { z } from 'zod';
import { getRequestContext } from '@/lib/server/env';
import { apiErrorResponse, badInput, describeZodError, INTERNAL_MESSAGE, llmFailure, logError, readJsonBody } from '@/lib/server/http';
import { buildProviderConfig, llmSink, routingCountry } from '@/lib/server/llm';
import { acquireGate, USER_DRAFT_REDO_DAILY_LIMIT, userSubject } from '@/lib/server/quota';
import { analysisFromRow, draftsToRows, loadAnalysisById, loadDrafts, loadJob, loadProfileForAnalysis } from '@/lib/server/saved-jobs';
import { sseResponse } from '@/lib/server/sse';
import { supabaseAdmin } from '@/lib/server/supabase';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// POST /api/jobs/:id/draft { analysisId } (signed in, W12). Drafts for a saved analysis, streamed
// like /api/draft, then saved as three `drafts` rows. The analysis is read from the DB (RLS: only
// the user's own), so no signed token is needed. The first draft set of an analysis is part of the
// analysis; each redo counts against "draft regenerate: 3 a day" (§9).

export const dynamic = 'force-dynamic';

const Body = z.object({ analysisId: z.uuid() });

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const jobId = z.uuid().safeParse((await ctx.params).id);
  if (!jobId.success) return apiErrorResponse('not_found', 'Job not found.', 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return badInput(describeZodError(parsed.error));

  const rc = await getRequestContext();
  const db = supabaseAdmin(rc.env);
  if (!db) {
    logError('config_missing', 'Supabase service role is not configured');
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }

  const supabase = await createSupabaseServer();
  let loaded;
  try {
    const [profile, job, row, existing] = await Promise.all([
      loadProfileForAnalysis(supabase, user.id),
      loadJob(supabase, jobId.data),
      loadAnalysisById(supabase, parsed.data.analysisId),
      loadDrafts(supabase, parsed.data.analysisId),
    ]);
    loaded = { profile, job, row, existing };
  } catch (err) {
    logError('job_draft_load_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
  const { profile, job, row, existing } = loaded;
  if (!job || !row || row.job_id !== job.id || row.user_id !== user.id) return apiErrorResponse('not_found', 'Analysis not found.', 404);
  if (!profile) return apiErrorResponse('bad_input', 'Finish setting up your profile first.', 400);
  const analysis = analysisFromRow(row, job);
  if (!analysis) return apiErrorResponse('bad_input', 'This analysis is out of date. Run the analysis again.', 400);

  const gate = await acquireGate({
    db,
    subject: userSubject(user.id),
    endpoint: 'draft',
    quota: existing ? { feature: 'draft', limit: USER_DRAFT_REDO_DAILY_LIMIT } : null,
    waitUntil: rc.waitUntil,
  });
  if (gate.outcome === 'locked') return apiErrorResponse('busy', 'Drafts are already being written. Please wait a few seconds.', 429);
  if (gate.outcome === 'quota_exceeded') {
    return apiErrorResponse('quota_exceeded', `You can rewrite drafts ${USER_DRAFT_REDO_DAILY_LIMIT} times a day. Come back tomorrow.`, 429);
  }

  const cvText = profile.cvText;
  const jobText = job.description;
  let llm: LlmObjectStreamResult<DraftsLLMUncapped>;
  try {
    llm = await runLLM({
      ...draftCall({ cvText, jobText, analysis }),
      stream: true,
      plan: 'free',
      userId: user.id,
      country: routingCountry(request, rc),
      providers: buildProviderConfig(rc.env, rc.isProd),
      sink: llmSink(db, rc.waitUntil),
    });
  } catch (err) {
    gate.release();
    logError('job_draft_failed', err, { stage: 'start' });
    const { body: errBody, status } = llmFailure(err);
    return Response.json(errBody, { status, headers: { 'cache-control': 'no-store' } });
  }

  return sseResponse(async (send) => {
    try {
      for await (const partial of llm.partialObjectStream) {
        if (!send('partial', partial)) break;
      }
      const final = await llm.final;
      const event: DraftResultEvent = finishDrafts(final.object, { cvText, jobText });
      await db.insert(
        'drafts',
        draftsToRows(event, { userId: user.id, analysisId: row.id, provider: final.provider, model: final.model, promptVersion: DRAFT_PROMPT_VERSION }),
      );
      send('result', event);
    } catch (err) {
      logError('job_draft_failed', err, { stage: 'stream', provider: llm.provider });
      send('error', llmFailure(err).body);
    } finally {
      gate.release();
    }
  });
}
