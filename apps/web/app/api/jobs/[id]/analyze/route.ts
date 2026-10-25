import { runLLM, type LlmObjectStreamResult } from '@jobpilot/core/llm';
import { analyzeCall, finishAnalysis, type AnalysisLLMTransport } from '@jobpilot/core/pipeline';
import type { AnalyzeResultEvent } from '@jobpilot/core/schemas';
import { z } from 'zod';
import { getRequestContext } from '@/lib/server/env';
import { apiErrorResponse, INTERNAL_MESSAGE, llmFailure, logError } from '@/lib/server/http';
import { buildProviderConfig, llmSink, routingCountry } from '@/lib/server/llm';
import { acquireGate, USER_ANALYZE_DAILY_LIMIT, userSubject } from '@/lib/server/quota';
import { analysisToRow, loadJob, loadProfileForAnalysis } from '@/lib/server/saved-jobs';
import { sseResponse } from '@/lib/server/sse';
import { supabaseAdmin } from '@/lib/server/supabase';
import { signAnalysisToken } from '@/lib/server/token';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// POST /api/jobs/:id/analyze (signed in, W12). Same pipeline and SSE wire format as /api/analyze,
// but the CV and country come from the user's profile and the job from the DB, and the result is
// saved in `analyses` (cache key: user, job, profile_version). The `result` event carries
// `analysisId`; the jobs page then calls /api/jobs/:id/draft. Free users: 5 analyses a day (§9).

export const dynamic = 'force-dynamic';

const JobId = z.uuid();

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const jobId = JobId.safeParse((await ctx.params).id);
  if (!jobId.success) return apiErrorResponse('not_found', 'Job not found.', 404);

  const rc = await getRequestContext();
  const secret = rc.env.ANALYSIS_TOKEN_SECRET;
  const db = supabaseAdmin(rc.env);
  if (!secret || !db) {
    logError('config_missing', !secret ? 'ANALYSIS_TOKEN_SECRET is not set' : 'Supabase service role is not configured');
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }

  const supabase = await createSupabaseServer();
  let profile: Awaited<ReturnType<typeof loadProfileForAnalysis>>;
  let job: Awaited<ReturnType<typeof loadJob>>;
  try {
    [profile, job] = await Promise.all([loadProfileForAnalysis(supabase, user.id), loadJob(supabase, jobId.data)]);
  } catch (err) {
    logError('job_analyze_load_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
  if (!job) return apiErrorResponse('not_found', 'Job not found.', 404);
  if (!profile) return apiErrorResponse('bad_input', 'Finish setting up your profile first: we analyze jobs against your CV.', 400);

  const gate = await acquireGate({
    db,
    subject: userSubject(user.id),
    endpoint: 'analyze',
    quota: { feature: 'analyze', limit: USER_ANALYZE_DAILY_LIMIT },
    waitUntil: rc.waitUntil,
  });
  if (gate.outcome === 'locked') return apiErrorResponse('busy', 'An analysis is already running. Please wait a few seconds.', 429);
  if (gate.outcome === 'quota_exceeded') {
    return apiErrorResponse('quota_exceeded', `You've used your ${USER_ANALYZE_DAILY_LIMIT} analyses today. Come back tomorrow.`, 429);
  }

  const cvText = profile.cvText;
  const jobText = job.description;
  let llm: LlmObjectStreamResult<AnalysisLLMTransport>;
  try {
    llm = await runLLM({
      ...analyzeCall({ cvText, jobText, country: profile.country }),
      stream: true,
      plan: 'free',
      userId: user.id,
      country: routingCountry(request, rc),
      providers: buildProviderConfig(rc.env, rc.isProd),
      sink: llmSink(db, rc.waitUntil),
    });
  } catch (err) {
    gate.release();
    logError('job_analyze_failed', err, { stage: 'start' });
    const { body: errBody, status } = llmFailure(err);
    return Response.json(errBody, { status, headers: { 'cache-control': 'no-store' } });
  }

  return sseResponse(async (send) => {
    try {
      for await (const partial of llm.partialObjectStream) {
        if (!send('partial', partial)) break; // client went away; the result is still saved below
      }
      const final = await llm.final;
      const { result } = finishAnalysis(final.object, { cvText, jobText }, final);
      const [saved] = await db.insertReturning<{ id: string }>(
        'analyses',
        analysisToRow(result, { userId: user.id, jobId: job.id, profileVersion: profile.profileVersion }),
        'user_id,job_id,profile_version',
      );
      // A pasted job only has a first-line title; the model read the whole post.
      if (job.sourceId === 'user_paste' && job.ownerId === user.id && result.job.title.trim()) {
        rc.waitUntil(
          db
            .update('jobs', { id: job.id }, { title: result.job.title.trim().slice(0, 160), company: result.job.company?.trim() || null })
            .catch((err: unknown) => logError('job_title_update_failed', err)),
        );
      }
      const event: AnalyzeResultEvent = {
        result,
        analysisToken: await signAnalysisToken(result, { cvText, jobText }, secret),
        ...(saved ? { analysisId: saved.id } : {}),
      };
      send('result', event);
    } catch (err) {
      logError('job_analyze_failed', err, { stage: 'stream', provider: llm.provider });
      send('error', llmFailure(err).body);
    } finally {
      gate.release();
    }
  });
}
