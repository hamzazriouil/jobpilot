import { z } from 'zod';
import { EligibilityVerdict, FitBand, Seniority } from './common';

// Contract: docs/05-ARCHITECTURE.md §7. Field names and enums must not drift.

export const RequirementType = z.enum(['must', 'nice']);
export type RequirementType = z.infer<typeof RequirementType>;

export const RequirementCategory = z.enum(['tech', 'experience', 'education', 'language', 'other']);
export type RequirementCategory = z.infer<typeof RequirementCategory>;

export const RequirementStatus = z.enum(['met', 'partial', 'missing']);
export type RequirementStatus = z.infer<typeof RequirementStatus>;

export const EvidenceSource = z.enum(['experience', 'project', 'skills_list', 'education', 'none']);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

export const Eligibility = z.object({
  verdict: EligibilityVerdict,
  allowedRegions: z.array(z.string()), // e.g. ["worldwide"] | ["US"] | ["EU","UK"]
  evidenceQuote: z.string().nullable(), // exact text from the job post
  reasoning: z.string().max(300),
});
export type Eligibility = z.infer<typeof Eligibility>;

export const Requirement = z.object({
  text: z.string().max(160),
  type: RequirementType,
  category: RequirementCategory,
  status: RequirementStatus,
  evidenceQuote: z.string().nullable(), // exact text from the CV
  evidenceSource: EvidenceSource,
  note: z.string().max(200),
});
export type Requirement = z.infer<typeof Requirement>;

export const Gap = z.object({ skill: z.string(), howToClose: z.string().max(240) });
export type Gap = z.infer<typeof Gap>;

/** What the LLM must return for task='analyze'. */
export const AnalysisLLM = z.object({
  job: z.object({
    title: z.string(),
    company: z.string().nullable(),
    level: Seniority,
  }),
  candidateLevel: Seniority,
  eligibility: Eligibility,
  requirements: z.array(Requirement).min(1).max(20),
  gaps: z.array(Gap).max(3),
  redFlags: z.array(z.string().max(160)).max(5), // e.g. "unpaid trial", "5+ yrs for junior title"
});
export type AnalysisLLM = z.infer<typeof AnalysisLLM>;

/** What the API returns to the client (server-computed fields added). */
export const AnalysisResult = AnalysisLLM.extend({
  score: z.number().int().min(0).max(100),
  band: FitBand,
  evidenceDowngrades: z.number().int(),
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;
