import { checkHonesty } from '@jobpilot/core/honesty';
import { runLLM, type LlmObjectStreamResult } from '@jobpilot/core/llm';
import { buildDraftPrompt, DRAFT_PROMPT_VERSION } from '@jobpilot/core/prompts';
import { DraftRequest, type DraftResultEvent } from '@jobpilot/core/schemas';
import { DraftsLLMUncapped, finalizeDrafts } from '@/lib/server/drafts';
import { getRequestContext } from '@/lib/server/env';
import {
  apiErrorResponse,
  badInput,
  describeZodError,
  INTERNAL_MESSAGE,
  llmFailure,
  logError,
  readJsonBody,
} from '@/lib/server/http';
import { anonSubject } from '@/lib/server/ip';
import { buildProviderConfig, llmSink, routingCountry } from '@/lib/server/llm';
import { acquireGate } from '@/lib/server/quota';
import { sseResponse } from '@/lib/server/sse';
import { supabaseAdmin } from '@/lib/server/supabase';
import { verifyAnalysisToken } from '@/lib/server/token';

// POST /api/draft (docs/05-ARCHITECTURE.md §5.2, §8). The analysis comes back as the HMAC-signed
// token from /api/analyze and must belong to the same CV and job text. Drafting is part of the
// analysis quota (§5.2), so v0 doesn't count it again; only the burst lock applies.
// Streams DraftsLLM partials, then one `result` { drafts, honestyFlags } or one `error`.

export const dynamic = 'force-dynamic';

const DRAFT_MAX_OUTPUT_TOKENS = 2048;

const TOKEN_REJECTED: Record<string, string> = {
  expired: 'This analysis has expired. Run the analysis again to write drafts.',
  mismatch: 'The CV or job text changed since the analysis. Run the analysis again.',
  malformed: 'Invalid analysis token. Run the analysis again.',
  bad_signature: 'Invalid analysis token. Run the analysis again.',
};

export async function POST(request: Request): Promise<Response> {
  const rc = await getRequestContext();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = DraftRequest.safeParse(body.value);
  if (!parsed.success) return badInput(describeZodError(parsed.error));
  const { cvText, jobText, analysisToken } = parsed.data;

  const secret = rc.env.ANALYSIS_TOKEN_SECRET;
  if (!secret) {
    logError('config_missing', 'ANALYSIS_TOKEN_SECRET is not set');
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
  const verified = await verifyAnalysisToken(analysisToken, { cvText, jobText }, secret);
  if (!verified.ok) return badInput(TOKEN_REJECTED[verified.reason] ?? TOKEN_REJECTED.malformed!);

  const db = supabaseAdmin(rc.env);
  const gate = await acquireGate({
    db,
    subject: await anonSubject(request.headers, rc.env.IP_HASH_SALT, rc.isProd),
    endpoint: 'draft',
    quota: null,
    waitUntil: rc.waitUntil,
  });
  if (gate.outcome === 'locked') {
    return apiErrorResponse('busy', 'Drafts are already being written. Please wait a few seconds.', 429);
  }

  const prompt = buildDraftPrompt({ cvText, jobText, analysis: verified.payload.result });
  let llm: LlmObjectStreamResult<DraftsLLMUncapped>;
  try {
    llm = await runLLM({
      task: 'draft',
      system: prompt.system,
      prompt: prompt.prompt,
      temperature: prompt.temperature,
      // Workers AI defaults to 256 output tokens, which truncates the JSON. Drafts are ~700.
      maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS,
      schema: DraftsLLMUncapped,
      stream: true,
      plan: 'free',
      country: routingCountry(request, rc),
      promptVersion: DRAFT_PROMPT_VERSION,
      providers: buildProviderConfig(rc.env, rc.isProd),
      sink: llmSink(db, rc.waitUntil),
    });
  } catch (err) {
    gate.release();
    logError('draft_failed', err, { stage: 'start' });
    const { body: errBody, status } = llmFailure(err);
    return Response.json(errBody, { status, headers: { 'cache-control': 'no-store' } });
  }

  return sseResponse(async (send) => {
    try {
      for await (const partial of llm.partialObjectStream) {
        if (!send('partial', partial)) break;
      }
      const final = await llm.final;
      const drafts = finalizeDrafts(final.object);
      const event: DraftResultEvent = { drafts, honestyFlags: checkHonesty(drafts, { cvText, jobText }) };
      send('result', event);
    } catch (err) {
      logError('draft_failed', err, { stage: 'stream', provider: llm.provider });
      send('error', llmFailure(err).body);
    } finally {
      gate.release();
    }
  });
}
