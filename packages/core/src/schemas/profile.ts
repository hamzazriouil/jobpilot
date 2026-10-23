import { z } from 'zod';
import { Seniority } from './common';

// What the CV parser returns (task='parse', Architecture §5.3). Stored, after the user
// reviews it in onboarding (UI-UX §4.4 step 2), in `profiles.cv_parsed`.
//
// Conventions (kept LLM-friendly: every key is required, "unknown" is `null`, never omitted):
// - Dates are free-form strings as written or normalized by the model, preferably
//   "YYYY-MM" or "YYYY". `end: null` means "current / present".
// - `summary` is one line, as shown in the onboarding review list.

export const ProfileExperience = z.object({
  title: z.string().max(120),
  org: z.string().max(120).nullable(),
  start: z.string().max(20).nullable(),
  end: z.string().max(20).nullable(),
  summary: z.string().max(300),
});
export type ProfileExperience = z.infer<typeof ProfileExperience>;

export const ProfileProject = z.object({
  name: z.string().max(120),
  url: z.string().max(300).nullable(),
  summary: z.string().max(300),
  tech: z.array(z.string().max(60)).max(20),
});
export type ProfileProject = z.infer<typeof ProfileProject>;

export const ProfileEducation = z.object({
  institution: z.string().max(160),
  degree: z.string().max(120).nullable(), // e.g. "BSc", "Master"
  field: z.string().max(120).nullable(), // e.g. "Computer Science"
  start: z.string().max(20).nullable(),
  end: z.string().max(20).nullable(),
});
export type ProfileEducation = z.infer<typeof ProfileEducation>;

export const ProfileLanguage = z.object({
  language: z.string().max(60), // e.g. "English"
  level: z.string().max(40).nullable(), // e.g. "native", "fluent", "B2"
});
export type ProfileLanguage = z.infer<typeof ProfileLanguage>;

export const ProfileLLM = z.object({
  skills: z.array(z.string().max(60)).max(80),
  experiences: z.array(ProfileExperience).max(30),
  projects: z.array(ProfileProject).max(30),
  education: z.array(ProfileEducation).max(10),
  seniorityGuess: Seniority,
  languages: z.array(ProfileLanguage).max(10),
});
export type ProfileLLM = z.infer<typeof ProfileLLM>;
