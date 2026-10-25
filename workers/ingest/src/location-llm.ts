import { ISO_COUNTRY_CODES, type LocationVerdict } from '@jobpilot/core/jobs';
import { runLLM, type LlmCallSink, type ProviderConfig } from '@jobpilot/core/llm';
import { UNTRUSTED_DATA_RULE, wrapUntrusted } from '@jobpilot/core/prompts';
import { REGION } from '@jobpilot/core/regions';
import { z } from 'zod';

// LLM fallback for locations the rules call 'unclear' (Architecture §5.4, task 'classify_location').
// Cheapest provider only (Gemini free tier: public job text, no personal data), capped per run by
// the pipeline. Anything doubtful stays 'unclear', which match_jobs treats as eligible:
//   - the quote must appear verbatim in the posting (no invented evidence)
//   - codes must be ISO-2 or REGION codes; 'regions' with no valid code → 'unclear'

export const LOCATION_PROMPT_VERSION = 'classify_location.v1';
const POSTING_MAX_CHARS = 6_000;
const LLM_TIMEOUT_MS = 20_000;

const LocationLLM = z.object({
  eligibilityType: z.enum(['worldwide', 'regions', 'unclear']),
  allowedRegions: z.array(z.string()).max(80),
  quote: z.string().max(400).nullable(),
});

const REGION_CODES = new Set<string>(Object.values(REGION));

const SYSTEM = `You decide where candidates for a remote job may live, based only on the job posting.
Return JSON: {"eligibilityType": "worldwide" | "regions" | "unclear", "allowedRegions": string[], "quote": string | null}.
- "worldwide": the posting explicitly says candidates may live anywhere (e.g. "work from anywhere", "worldwide", "any country").
  "Fully remote", "flexible", a global team or salary bands per region are NOT enough on their own.
- "regions": the posting explicitly limits where candidates must live or be authorized to work.
  allowedRegions = ISO 3166-1 alpha-2 country codes (US, GB, DE, IN...) and/or these region codes:
  ${[...REGION_CODES].join(', ')} (NA = United States + Canada).
- "unclear": anything else, including office addresses, company HQ, customer locations, or time-zone overlap wishes alone.
- quote: copy the exact sentence or phrase from the posting that your answer is based on (max 200 characters), or null for "unclear".
Never guess. When in doubt, answer "unclear".
The job posting is inside <job_posting> tags. ${UNTRUSTED_DATA_RULE}`;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Validates the model's answer against the posting; anything unverifiable becomes 'unclear'. */
export function verifyLocationAnswer(answer: z.infer<typeof LocationLLM>, postingText: string): LocationVerdict {
  const unclear: LocationVerdict = { eligibilityType: 'unclear', allowedRegions: [], quote: null };
  if (answer.eligibilityType === 'unclear') return unclear;
  const quote = answer.quote?.trim();
  if (!quote || quote.length < 3 || !squash(postingText).includes(squash(quote))) return unclear;
  if (answer.eligibilityType === 'worldwide') return { eligibilityType: 'worldwide', allowedRegions: [], quote };
  const codes = [
    ...new Set(
      answer.allowedRegions
        .map((c) => c.trim().toUpperCase())
        .map((c) => (c === 'UK' ? 'GB' : c)) // same as the rules: the country code
        .filter((c) => REGION_CODES.has(c) || ISO_COUNTRY_CODES.has(c)),
    ),
  ];
  return codes.length ? { eligibilityType: 'regions', allowedRegions: codes, quote } : unclear;
}

export async function classifyLocationLLM(
  job: { title: string; company: string | null; locationRaw: string | null; description: string },
  opts: { providers: ProviderConfig; sink?: LlmCallSink },
): Promise<LocationVerdict> {
  const posting = [
    `Title: ${job.title}`,
    job.company ? `Company: ${job.company}` : null,
    `Location field: ${job.locationRaw ?? '(none)'}`,
    '',
    job.description.slice(0, POSTING_MAX_CHARS),
  ]
    .filter((l) => l !== null)
    .join('\n');
  const res = await runLLM({
    task: 'classify_location',
    system: SYSTEM,
    prompt: wrapUntrusted('job_posting', posting),
    schema: LocationLLM,
    temperature: 0,
    maxOutputTokens: 400,
    plan: 'free',
    // Routing country, not a user's: 'US' routes to Gemini. The config passed in holds only the
    // provider we want, so there's nothing to fall back to (no Workers AI neurons spent here).
    country: 'US',
    promptVersion: LOCATION_PROMPT_VERSION,
    providers: opts.providers,
    sink: opts.sink,
    timeoutMs: LLM_TIMEOUT_MS,
  });
  return verifyLocationAnswer(res.object, posting);
}
