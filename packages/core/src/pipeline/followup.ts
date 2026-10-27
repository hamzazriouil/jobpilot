import { z } from 'zod';
import { findUnsupportedFacts, prepareHonestySources, type HonestyContext } from '../honesty';
import { buildFollowUpPrompt, FOLLOWUP_PROMPT_VERSION, type FollowUpPromptInput } from '../prompts';
import type { HonestyFlag } from '../schemas';
import { trimToLength } from './text';

// The provider-independent half of POST /api/applications/:id/follow-up (docs/05-ARCHITECTURE.md §5.6):
//   followUpCall()   → prompt + run options for runLLM
//   finishFollowUp() → trim to the cap → honesty check (same rules as the drafts)

export const FOLLOWUP_MAX_OUTPUT_TOKENS = 512;
/** ~90 words, with room to spare. */
export const FOLLOWUP_MAX_CHARS = 700;

export const FollowUpLLM = z.object({ message: z.string().min(1) });
export type FollowUpLLM = z.infer<typeof FollowUpLLM>;

/** Everything runLLM needs for the follow-up call except routing (plan, country, providers) and sink. */
export function followUpCall(input: FollowUpPromptInput) {
  const prompt = buildFollowUpPrompt(input);
  return {
    task: 'follow_up',
    system: prompt.system,
    prompt: prompt.prompt,
    temperature: prompt.temperature,
    maxOutputTokens: FOLLOWUP_MAX_OUTPUT_TOKENS,
    schema: FollowUpLLM,
    promptVersion: FOLLOWUP_PROMPT_VERSION,
  } as const;
}

export interface FollowUpOutcome {
  message: string;
  honestyFlags: HonestyFlag[];
}

export function finishFollowUp(raw: FollowUpLLM, ctx: HonestyContext): FollowUpOutcome {
  const message = trimToLength(raw.message.trim(), FOLLOWUP_MAX_CHARS);
  return { message, honestyFlags: findUnsupportedFacts(message, prepareHonestySources(ctx)).map((text) => ({ draft: 'followUp' as const, text })) };
}
