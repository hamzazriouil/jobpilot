import { z } from 'zod';
import { AnalysisResult } from './analysis';
import { DraftsLLM } from './drafts';

// Contract: SSE wire format for POST /api/analyze and POST /api/draft (Architecture §5.1, §5.2, §8).
// Shared by the route handlers (apps/web/app/api) and the client parser (apps/web/lib/client).
//
// Each event is `event: <name>\ndata: <one-line JSON>\n\n`. Order: zero or more `partial`, then exactly
// one `result` OR one `error`, then the stream closes. Errors before the stream starts (bad input,
// quota) are plain JSON responses with the ApiError shape and a 4xx/5xx status, not SSE.

export const ApiErrorCode = z.enum(['bad_input', 'unauthorized', 'quota_exceeded', 'busy', 'not_found', 'internal']);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z.object({ error: z.object({ code: ApiErrorCode, message: z.string() }) });
export type ApiError = z.infer<typeof ApiError>;

/** One proper noun, number or year in a draft that does not appear in the CV or the job post. */
export const HonestyFlag = z.object({
  draft: z.enum(['coverLetter', 'coldDm', 'cvBullet', 'followUp']),
  text: z.string(),
});
export type HonestyFlag = z.infer<typeof HonestyFlag>;

/** `event: result` of /api/analyze. The score/band are server-computed; the client never recomputes them. */
export const AnalyzeResultEvent = z.object({
  result: AnalysisResult,
  analysisToken: z.string(),
  /** Phase 1, saved jobs only: the stored `analyses` row (POST /api/jobs/:id/analyze). */
  analysisId: z.uuid().optional(),
});
export type AnalyzeResultEvent = z.infer<typeof AnalyzeResultEvent>;

/** `event: result` of /api/draft. */
export const DraftResultEvent = z.object({
  drafts: DraftsLLM,
  honestyFlags: z.array(HonestyFlag),
});
export type DraftResultEvent = z.infer<typeof DraftResultEvent>;

/** `event: partial` data is a deep-partial AnalysisLLM (analyze) or DraftsLLM (draft): render it, never trust it. */
export const SSE_EVENTS = ['partial', 'result', 'error'] as const;
export type SseEventName = (typeof SSE_EVENTS)[number];
