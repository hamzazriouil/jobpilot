import { z } from 'zod';
import { CvBullet, DraftsLLM } from '@jobpilot/core/schemas';

// DraftsLLM caps the cover letter at 1600 chars and the DM at 600 ("enforced in prompt + trimmed",
// Architecture §7). The model is asked for the same JSON without the caps, so a slightly long
// letter is trimmed here instead of costing a schema-repair LLM call.

export const DraftsLLMUncapped = z.object({
  coverLetter: z.string(),
  coldDm: z.string(),
  cvBullets: z.array(CvBullet),
});
export type DraftsLLMUncapped = z.infer<typeof DraftsLLMUncapped>;

const COVER_LETTER_MAX = 1600;
const COLD_DM_MAX = 600;
const CV_BULLETS_MAX = 3;

/** Cuts at the last sentence end (or word break) that fits. */
export function trimToLength(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentence > max * 0.6) return head.slice(0, sentence + 1).trim();
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head).trim();
}

export function finalizeDrafts(raw: DraftsLLMUncapped): DraftsLLM {
  return DraftsLLM.parse({
    coverLetter: trimToLength(raw.coverLetter, COVER_LETTER_MAX),
    coldDm: trimToLength(raw.coldDm, COLD_DM_MAX),
    cvBullets: raw.cvBullets.slice(0, CV_BULLETS_MAX),
  });
}
