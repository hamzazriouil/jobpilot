import { runLLM } from '@jobpilot/core/llm';
import { finalizeProfile, parseCall } from '@jobpilot/core/pipeline';
import { ProfileParseRequest } from '@jobpilot/core/schemas';
import { getRequestContext } from '@/lib/server/env';
import { apiErrorResponse, badInput, describeZodError, llmFailure, logError, readJsonBody } from '@/lib/server/http';
import { buildProviderConfig, llmSink, routingCountry } from '@/lib/server/llm';
import { acquireGate, USER_PARSE_DAILY_LIMIT, userSubject } from '@/lib/server/quota';
import { supabaseAdmin } from '@/lib/server/supabase';
import { requireUser } from '@/lib/supabase/server';

// POST /api/profile/parse { cvText } → ProfileLLM JSON (docs/05-ARCHITECTURE.md §5.3, §8).
// Nothing is stored here: the user reviews the result in onboarding, then PUT /api/profile saves it.

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const rc = await getRequestContext();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = ProfileParseRequest.safeParse(body.value);
  if (!parsed.success) return badInput(describeZodError(parsed.error));

  const db = supabaseAdmin(rc.env);
  const gate = await acquireGate({
    db,
    subject: userSubject(auth.user.id),
    endpoint: 'parse',
    quota: { feature: 'parse', limit: USER_PARSE_DAILY_LIMIT },
    waitUntil: rc.waitUntil,
  });
  if (gate.outcome === 'locked') return apiErrorResponse('busy', 'Your CV is already being read. Please wait a few seconds.', 429);
  if (gate.outcome === 'quota_exceeded') {
    return apiErrorResponse('quota_exceeded', `You can parse your CV ${USER_PARSE_DAILY_LIMIT} times a day. Edit the fields by hand, or come back tomorrow.`, 429);
  }

  try {
    const result = await runLLM({
      ...parseCall({ cvText: parsed.data.cvText }),
      plan: 'free',
      userId: auth.user.id,
      country: routingCountry(request, rc),
      providers: buildProviderConfig(rc.env, rc.isProd),
      sink: llmSink(db, rc.waitUntil),
    });
    return Response.json({ profile: finalizeProfile(result.object) }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    logError('profile_parse_failed', err);
    const { body: errBody, status } = llmFailure(err);
    return Response.json(errBody, { status, headers: { 'cache-control': 'no-store' } });
  } finally {
    gate.release();
  }
}
