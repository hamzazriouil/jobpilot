import { z } from 'zod';

// Contract: docs/05-ARCHITECTURE.md §7.

export const CvBullet = z.object({ original: z.string().nullable(), improved: z.string() });
export type CvBullet = z.infer<typeof CvBullet>;

/** What the LLM must return for task='draft'. */
export const DraftsLLM = z.object({
  coverLetter: z.string().max(1600), // ≤ ~200 words (enforced in prompt + trimmed)
  coldDm: z.string().max(600), // ≤ ~80 words
  cvBullets: z.array(CvBullet).max(3),
});
export type DraftsLLM = z.infer<typeof DraftsLLM>;
