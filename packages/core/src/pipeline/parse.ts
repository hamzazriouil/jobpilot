import { z } from 'zod';
import { buildParsePrompt, PARSE_PROMPT_VERSION, type ParsePromptInput } from '../prompts';
import { ProfileLLM, Seniority } from '../schemas';
import { trimToLength } from './text';

// POST /api/profile/parse (docs/05-ARCHITECTURE.md §5.3):
//   parseCall()     → prompt + run options for runLLM
//   finalizeProfile() → trim to the ProfileLLM caps
// The model gets the same JSON shape without length caps, so one long summary or a 90th skill is
// trimmed here instead of failing validation and costing a repair call (same idea as draft.ts).

export const PARSE_MAX_OUTPUT_TOKENS = 4096;

const loose = z.string();
const nullableLoose = z.string().nullable();

export const ProfileLLMTransport = z.object({
  skills: z.array(loose),
  experiences: z.array(z.object({ title: loose, org: nullableLoose, start: nullableLoose, end: nullableLoose, summary: loose })),
  projects: z.array(z.object({ name: loose, url: nullableLoose, summary: loose, tech: z.array(loose) })),
  education: z.array(
    z.object({ institution: loose, degree: nullableLoose, field: nullableLoose, start: nullableLoose, end: nullableLoose }),
  ),
  seniorityGuess: Seniority,
  languages: z.array(z.object({ language: loose, level: nullableLoose })),
});
export type ProfileLLMTransport = z.infer<typeof ProfileLLMTransport>;

const cut = (s: string, max: number) => trimToLength(s.trim(), max);
const cutOrNull = (s: string | null, max: number) => {
  const t = s?.trim();
  return t ? cut(t, max) : null;
};

/** Caps every list and string to the ProfileLLM limits, drops empty items and duplicate skills. */
export function finalizeProfile(raw: ProfileLLMTransport): ProfileLLM {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const s of raw.skills) {
    const v = cut(s, 60);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    skills.push(v);
  }
  return ProfileLLM.parse({
    skills: skills.slice(0, 80),
    experiences: raw.experiences
      .filter((e) => e.title.trim())
      .slice(0, 30)
      .map((e) => ({
        title: cut(e.title, 120),
        org: cutOrNull(e.org, 120),
        start: cutOrNull(e.start, 20),
        end: cutOrNull(e.end, 20),
        summary: cut(e.summary, 300),
      })),
    projects: raw.projects
      .filter((p) => p.name.trim())
      .slice(0, 30)
      .map((p) => ({
        name: cut(p.name, 120),
        url: cutOrNull(p.url, 300),
        summary: cut(p.summary, 300),
        tech: p.tech.map((t) => cut(t, 60)).filter(Boolean).slice(0, 20),
      })),
    education: raw.education
      .filter((e) => e.institution.trim())
      .slice(0, 10)
      .map((e) => ({
        institution: cut(e.institution, 160),
        degree: cutOrNull(e.degree, 120),
        field: cutOrNull(e.field, 120),
        start: cutOrNull(e.start, 20),
        end: cutOrNull(e.end, 20),
      })),
    seniorityGuess: raw.seniorityGuess,
    languages: raw.languages
      .filter((l) => l.language.trim())
      .slice(0, 10)
      .map((l) => ({ language: cut(l.language, 60), level: cutOrNull(l.level, 40) })),
  });
}

/** Everything runLLM needs for the parse call except routing (plan, country, providers) and sink. */
export function parseCall(input: ParsePromptInput) {
  const prompt = buildParsePrompt(input);
  return {
    task: 'parse',
    system: prompt.system,
    prompt: prompt.prompt,
    temperature: prompt.temperature,
    maxOutputTokens: PARSE_MAX_OUTPUT_TOKENS,
    schema: ProfileLLMTransport,
    promptVersion: PARSE_PROMPT_VERSION,
  } as const;
}
