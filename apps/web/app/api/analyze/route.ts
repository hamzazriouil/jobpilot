import { runLLM, type LlmObjectStreamResult } from '@jobpilot/core/llm';
import { analyzeCall, finishAnalysis, type AnalysisLLMTransport } from '@jobpilot/core/pipeline';
import { AnalyzeRequest, type AnalyzeResultEvent } from '@jobpilot/core/schemas';
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
import { acquireGate, ANON_ANALYZE_DAILY_LIMIT } from '@/lib/server/quota';
import { sseResponse } from '@/lib/server/sse';
import { supabaseAdmin } from '@/lib/server/supabase';
import { signAnalysisToken } from '@/lib/server/token';

// POST /api/analyze (docs/05-ARCHITECTURE.md §5.1, §8). SSE wire format: @jobpilot/core/schemas stream.ts.
// validate → quota (+ burst lock) → LLM structured stream (`partial` events) → evidence check + score
// in code → one `result` { result, analysisToken } or one `error`. Pre-stream failures are JSON.
// The prompt, run options, normalization, evidence check and scoring come from
// @jobpilot/core/pipeline, the same code the eval runner measures (evals/run.ts).

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const rc = await getRequestContext();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = AnalyzeRequest.safeParse(body.value);
  if (!parsed.success) return badInput(describeZodError(parsed.error));
  const { cvText, jobText, country } = parsed.data;

  const secret = rc.env.ANALYSIS_TOKEN_SECRET;
  if (!secret) {
    logError('config_missing', 'ANALYSIS_TOKEN_SECRET is not set');
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }

  // v0: anonymous only (accounts arrive in Phase 1 with `user:<uuid>` subjects and a 5/day limit).
  const db = supabaseAdmin(rc.env);
  const gate = await acquireGate({
    db,
    subject: await anonSubject(request.headers, rc.env.IP_HASH_SALT, rc.isProd),
    endpoint: 'analyze',
    quota: { feature: 'analyze', limit: ANON_ANALYZE_DAILY_LIMIT },
    waitUntil: rc.waitUntil,
  });
  if (gate.outcome === 'locked') {
    return apiErrorResponse('busy', 'An analysis is already running. Please wait a few seconds.', 429);
  }
  if (gate.outcome === 'quota_exceeded') {
    return apiErrorResponse(
      'quota_exceeded',
      `You've used your ${ANON_ANALYZE_DAILY_LIMIT} free analyses today. Come back tomorrow.`,
      429,
    );
  }

  let llm: LlmObjectStreamResult<AnalysisLLMTransport>;
  try {
    llm = await runLLM({
      ...analyzeCall({ cvText, jobText, country }),
      stream: true,
      plan: 'free',
      country: routingCountry(request, rc),
      providers: buildProviderConfig(rc.env, rc.isProd),
      sink: llmSink(db, rc.waitUntil),
    });
  } catch (err) {
    gate.release();
    logError('analyze_failed', err, { stage: 'start' });
    const { body: errBody, status } = llmFailure(err);
    return Response.json(errBody, { status, headers: { 'cache-control': 'no-store' } });
  }

  return sseResponse(async (send) => {
    try {
      for await (const partial of llm.partialObjectStream) {
        if (!send('partial', partial)) break; // client went away; the LLM call still finishes and is logged
      }
      const final = await llm.final;
      const { result } = finishAnalysis(final.object, { cvText, jobText }, final);
      const event: AnalyzeResultEvent = {
        result,
        analysisToken: await signAnalysisToken(result, { cvText, jobText }, secret),
      };
      send('result', event);
    } catch (err) {
      logError('analyze_failed', err, { stage: 'stream', provider: llm.provider });
      send('error', llmFailure(err).body);
    } finally {
      gate.release();
    }
  });
}
