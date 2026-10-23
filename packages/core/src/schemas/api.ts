import { z } from 'zod';
import { CountryCode } from './common';

// Request bodies for the Phase 0 API (Architecture §5.1, §5.2, §8).
// Lengths are measured after trimming surrounding whitespace.

export const CV_TEXT_MIN = 200;
export const CV_TEXT_MAX = 20_000;
export const JOB_TEXT_MIN = 200;
export const JOB_TEXT_MAX = 15_000;

export const CvText = z.string().trim().min(CV_TEXT_MIN).max(CV_TEXT_MAX);
export const JobText = z.string().trim().min(JOB_TEXT_MIN).max(JOB_TEXT_MAX);

/** POST /api/analyze */
export const AnalyzeRequest = z.object({
  cvText: CvText,
  jobText: JobText,
  country: CountryCode, // self-declared residence; used for eligibility only, never routing
  jobId: z.uuid().optional(), // Phase 1: analyze a stored job
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

/** POST /api/draft */
export const DraftRequest = z.object({
  cvText: CvText,
  jobText: JobText,
  analysisToken: z.string().min(1).max(20_000), // HMAC-signed analysis from /api/analyze
});
export type DraftRequest = z.infer<typeof DraftRequest>;
