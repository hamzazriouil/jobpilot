import { z } from 'zod';

/** Mirrors the `seniority` Postgres enum (docs/02-DATABASE.md §4). */
export const SENIORITY_VALUES = ['intern', 'junior', 'mid', 'senior', 'lead'] as const;
export const Seniority = z.enum(SENIORITY_VALUES);
export type Seniority = z.infer<typeof Seniority>;

/** Numeric level used by the scoring rubric (Architecture §6). */
export const SENIORITY_LEVEL: Readonly<Record<Seniority, number>> = Object.freeze({
  intern: 0,
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
});

/** Mirrors the `eligibility_v` Postgres enum. */
export const EligibilityVerdict = z.enum(['eligible', 'unclear', 'not_eligible']);
export type EligibilityVerdict = z.infer<typeof EligibilityVerdict>;

/** Mirrors the `fit_band` Postgres enum. */
export const FitBand = z.enum(['strong', 'good', 'stretch', 'long_shot']);
export type FitBand = z.infer<typeof FitBand>;

/** ISO 3166-1 alpha-2, normalized to uppercase ("ma" → "MA"). */
export const CountryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Expected an ISO 3166-1 alpha-2 country code');
export type CountryCode = z.infer<typeof CountryCode>;
