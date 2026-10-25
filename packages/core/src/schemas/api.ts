import { z } from 'zod';
import { CountryCode, Seniority } from './common';
import { ProfileLLM } from './profile';

// Request bodies for the API (Architecture §5.1–5.3, §8).
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

/** POST /api/profile/parse (Phase 1). */
export const ProfileParseRequest = z.object({ cvText: CvText });
export type ProfileParseRequest = z.infer<typeof ProfileParseRequest>;

/** Country or region code ('MA', 'EU', 'EMEA', 'SOUTH_ASIA', …), see regions.ts. */
export const AreaCode = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z_]{1,11}$/, 'Expected a country or region code');

/**
 * PUT /api/profile (Phase 1, onboarding step 3 and settings). The server expands `country` into
 * regions, adds `extraRegions` (where else the user may legally work), embeds the profile and bumps
 * `profile_version`.
 */
export const ProfileUpdateRequest = z.object({
  cvText: CvText,
  cvParsed: ProfileLLM, // reviewed by the user
  country: CountryCode,
  extraRegions: z.array(AreaCode).max(40).default([]),
  targetRoles: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
  seniority: Seniority,
  salaryFloorUsd: z.number().int().min(0).max(100_000).nullable().default(null), // monthly
  digestOptIn: z.boolean().default(false),
});
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequest>;
