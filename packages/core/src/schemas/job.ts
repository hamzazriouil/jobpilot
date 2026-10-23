import { z } from 'zod';
import { Seniority } from './common';

// Mirrors the `jobs` table (docs/02-DATABASE.md §4), camelCased.
// Timestamps are ISO strings as returned by PostgREST (validated loosely on purpose).

export const JOB_DESCRIPTION_MAX = 15_000;
export const EMBEDDING_DIMS = 768; // bge-base-en-v1.5

export const JobEligibilityType = z.enum(['worldwide', 'regions', 'unclear']);
export type JobEligibilityType = z.infer<typeof JobEligibilityType>;

const Timestamp = z.string().min(1);

/** A full `jobs` row. */
export const Job = z.object({
  id: z.uuid(),
  sourceId: z.string().min(1), // 'remoteok' | 'remotive' | ... | 'user_paste'
  sourceJobId: z.string().nullable(), // null for pasted jobs
  ownerId: z.uuid().nullable(), // null = public feed job
  url: z.string().nullable(),
  title: z.string().min(1),
  company: z.string().nullable(),
  companyUrl: z.string().nullable(),
  description: z.string().min(1).max(JOB_DESCRIPTION_MAX),
  locationRaw: z.string().nullable(),
  eligibilityType: JobEligibilityType.nullable(),
  allowedRegions: z.array(z.string()), // ISO-2 and region codes: 'US','EU','EMEA','AFRICA','MA'...
  eligibilityQuote: z.string().nullable(),
  seniority: Seniority.nullable(),
  salaryMinUsd: z.number().int().nullable(), // yearly
  salaryMaxUsd: z.number().int().nullable(),
  tags: z.array(z.string()),
  contentHash: z.string().min(1),
  embedding: z.array(z.number()).length(EMBEDDING_DIMS).nullable(),
  postedAt: Timestamp.nullable(),
  ingestedAt: Timestamp,
  expiresAt: Timestamp.nullable(),
});
export type Job = z.infer<typeof Job>;

/**
 * A normalized job as produced by a source adapter or a user paste, before insert.
 * DB-generated / pipeline-computed columns (id, ingestedAt, contentHash, embedding) are excluded;
 * optional columns default to null / [] so adapters only fill what they know.
 */
export const JobInput = z.object({
  sourceId: z.string().min(1),
  sourceJobId: z.string().nullable().default(null),
  ownerId: z.uuid().nullable().default(null),
  url: z.string().nullable().default(null),
  title: z.string().trim().min(1),
  company: z.string().nullable().default(null),
  companyUrl: z.string().nullable().default(null),
  description: z.string().trim().min(1).max(JOB_DESCRIPTION_MAX),
  locationRaw: z.string().nullable().default(null),
  eligibilityType: JobEligibilityType.nullable().default(null),
  allowedRegions: z.array(z.string()).default([]),
  eligibilityQuote: z.string().nullable().default(null),
  seniority: Seniority.nullable().default(null),
  salaryMinUsd: z.number().int().nullable().default(null),
  salaryMaxUsd: z.number().int().nullable().default(null),
  tags: z.array(z.string()).default([]),
  postedAt: Timestamp.nullable().default(null),
  expiresAt: Timestamp.nullable().default(null),
});
/** Parsed (defaults applied). */
export type JobInput = z.output<typeof JobInput>;
/** What callers may pass in (optional fields may be omitted). */
export type JobInputRaw = z.input<typeof JobInput>;
