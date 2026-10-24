import { z } from 'zod';
import { checkHonesty, type HonestyContext } from '../honesty';
import { buildDraftPrompt, DRAFT_PROMPT_VERSION, type DraftPromptInput } from '../prompts';
import { CvBullet, DraftsLLM, type HonestyFlag } from '../schemas';
import { trimToLength } from './text';

// The provider-independent half of POST /api/draft (docs/05-ARCHITECTURE.md §5.2), shared by the
// route and the eval runner:
//   draftCall()   → prompt + run options for runLLM
//   finishDrafts() → trim to the DraftsLLM caps → honesty check

/** Workers AI defaults to 256 output tokens, which truncates the JSON. Drafts are ~700. */
export const DRAFT_MAX_OUTPUT_TOKENS = 2048;

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

export function finalizeDrafts(raw: DraftsLLMUncapped): DraftsLLM {
  return DraftsLLM.parse({
    coverLetter: trimToLength(raw.coverLetter, COVER_LETTER_MAX),
    coldDm: trimToLength(raw.coldDm, COLD_DM_MAX),
    cvBullets: raw.cvBullets.slice(0, CV_BULLETS_MAX),
  });
}

/** Everything runLLM needs for the draft call except routing (plan, country, providers), sink and stream. */
export function draftCall(input: DraftPromptInput) {
  const prompt = buildDraftPrompt(input);
  return {
    task: 'draft',
    system: prompt.system,
    prompt: prompt.prompt,
    temperature: prompt.temperature,
    maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS,
    schema: DraftsLLMUncapped,
    promptVersion: DRAFT_PROMPT_VERSION,
  } as const;
}

export interface DraftsOutcome {
  drafts: DraftsLLM;
  honestyFlags: HonestyFlag[];
}

/** Step 3 of §5.2 on the validated LLM object. */
export function finishDrafts(raw: DraftsLLMUncapped, ctx: HonestyContext): DraftsOutcome {
  const drafts = finalizeDrafts(raw);
  return { drafts, honestyFlags: checkHonesty(drafts, ctx) };
}
