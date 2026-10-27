import { runLLM } from '@jobpilot/core/llm';
import { finishFollowUp, followUpCall } from '@jobpilot/core/pipeline';
import { FOLLOWUP_PROMPT_VERSION } from '@jobpilot/core/prompts';
import { z } from 'zod';
import { getRequestContext } from '@/lib/server/env';
import { apiErrorResponse, INTERNAL_MESSAGE, llmFailure, logError } from '@/lib/server/http';
import { buildProviderConfig, llmSink, routingCountry } from '@/lib/server/llm';
import { acquireGate, USER_FOLLOW_UP_DAILY_LIMIT, userSubject } from '@/lib/server/quota';
import { loadProfileForAnalysis } from '@/lib/server/saved-jobs';
import { supabaseAdmin } from '@/lib/server/supabase';
import { daysSince, type Channel } from '@/lib/tracker';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// POST /api/applications/:id/follow-up (docs/05-ARCHITECTURE.md §5.6, PRD F1.8, W16): writes a short
// follow-up message for a tracked application from the user's CV and the job post, runs the
// drafts' honesty check on it and saves it as a `follow_up` draft linked to the application.
// One JSON response (the message is ~90 words, not worth streaming). Counted against
// USER_FOLLOW_UP_DAILY_LIMIT per day; plan-based limits arrive with W19.

export const dynamic = 'force-dynamic';

interface AppRow {
  id: string;
  analysis_id: string | null;
  channel: Channel | null;
  applied_at: string | null;
  jobs: { title: string; company: string | null; description: string } | null;
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return apiErrorResponse('not_found', 'Application not found.', 404);

  const rc = await getRequestContext();
  const db = supabaseAdmin(rc.env);
  if (!db) {
    logError('config_missing', 'Supabase service role is not configured');
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }

  const supabase = await createSupabaseServer();
  let app: AppRow | null;
  let profile;
  try {
    const [appRes, prof] = await Promise.all([
      supabase
        .from('applications')
        .select('id, analysis_id, channel, applied_at, jobs(title, company, description)')
        .eq('id', id.data)
        .eq('user_id', user.id)
        .maybeSingle(),
      loadProfileForAnalysis(supabase, user.id),
    ]);
    if (appRes.error) throw appRes.error;
    app = appRes.data as unknown as AppRow | null;
    profile = prof;
  } catch (err) {
    logError('follow_up_load_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
  if (!app?.jobs) return apiErrorResponse('not_found', 'Application not found.', 404);
  if (!profile) return apiErrorResponse('bad_input', 'Finish setting up your profile first.', 400);

  const gate = await acquireGate({
    db,
    subject: userSubject(user.id),
    endpoint: 'follow_up',
    quota: { feature: 'follow_up', limit: USER_FOLLOW_UP_DAILY_LIMIT },
    waitUntil: rc.waitUntil,
  });
  if (gate.outcome === 'locked') return apiErrorResponse('busy', 'A follow-up is already being written. Please wait a few seconds.', 429);
  if (gate.outcome === 'quota_exceeded') {
    return apiErrorResponse('quota_exceeded', `You can write ${USER_FOLLOW_UP_DAILY_LIMIT} follow-ups a day. Come back tomorrow.`, 429);
  }

  const cvText = profile.cvText;
  const jobText = app.jobs.description;
  try {
    const result = await runLLM({
      ...followUpCall({
        cvText,
        jobText,
        role: app.jobs.title,
        company: app.jobs.company,
        daysSinceApplied: app.applied_at ? daysSince(app.applied_at) : null,
        channel: app.channel,
      }),
      plan: 'free',
      userId: user.id,
      country: routingCountry(request, rc),
      providers: buildProviderConfig(rc.env, rc.isProd),
      sink: llmSink(db, rc.waitUntil),
    });
    const out = finishFollowUp(result.object, { cvText, jobText });
    const createdAt = new Date().toISOString();
    await db.insert('drafts', {
      user_id: user.id,
      application_id: app.id,
      analysis_id: app.analysis_id,
      kind: 'follow_up',
      content: out.message,
      honesty_flags: out.honestyFlags,
      provider: result.provider,
      model: result.model,
      prompt_version: FOLLOWUP_PROMPT_VERSION,
      created_at: createdAt,
    });
    return Response.json({ followUp: { ...out, createdAt } }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    logError('follow_up_failed', err);
    const { body: errBody, status } = llmFailure(err);
    return Response.json(errBody, { status, headers: { 'cache-control': 'no-store' } });
  } finally {
    gate.release();
  }
}
