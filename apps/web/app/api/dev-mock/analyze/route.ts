// DEV ONLY: replays SAMPLE_ANALYSIS_FIXTURE as the /api/analyze SSE stream (404 in production).
// Whatever CV/job is posted, the answer is the sample analysis; only the country is honored, so
// a non-EMEA country shows the "not eligible" path. Open the page with `?mock=1` to use it.
import { AnalyzeRequest, type AnalysisLLM } from '@jobpilot/core/schemas';
import { SAMPLE_ANALYSIS_FIXTURE, SAMPLE_CV, SAMPLE_JOB } from '@jobpilot/core/prompts';
import { expandRegions } from '@jobpilot/core/regions';
import { toAnalysisResult } from '@jobpilot/core/scoring';
import { devOnly, jsonError, scenarioFrom, sseReplay, wordPrefixes, type MockFrame } from '../_lib/replay';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const scenario = scenarioFrom(req);
  if (scenario === 'quota') return jsonError('quota_exceeded', 'Daily analysis limit reached (dev mock).', 429);
  if (scenario === 'busy') return jsonError('busy', 'All providers are rate-limited (dev mock).', 503);
  if (scenario === 'bad_input') return jsonError('bad_input', "This doesn't look like a job post (dev mock).", 400);

  const body = AnalyzeRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError('bad_input', 'cvText, jobText (200+ chars) and country are required.', 400);

  const analysis = withCountry(SAMPLE_ANALYSIS_FIXTURE, body.data.country);
  const delay = scenario === 'slow' ? 1000 : 250;
  const frames: MockFrame[] = analysisSnapshots(analysis).map((data, i) => ({
    event: 'partial',
    data,
    delayMs: i === 0 ? 600 : delay,
  }));

  if (scenario === 'error') {
    frames.splice(Math.floor(frames.length / 2));
    frames.push({ event: 'error', data: { error: { code: 'internal', message: 'Model output was invalid (dev mock).' } }, delayMs: delay });
  } else {
    const result = toAnalysisResult(
      analysis,
      { cvText: SAMPLE_CV, jobText: SAMPLE_JOB },
      { provider: 'dev-mock', model: 'fixture', promptVersion: 'analyze.v1' },
    );
    frames.push({ event: 'result', data: { result, analysisToken: 'dev-mock-token' }, delayMs: delay });
  }
  return sseReplay(frames, req.signal);
}

/** The fixture's role is EMEA-only: flip the verdict for countries outside EMEA. */
function withCountry(fixture: AnalysisLLM, country: string): AnalysisLLM {
  if (expandRegions(country).includes('EMEA')) return fixture;
  return {
    ...fixture,
    eligibility: {
      ...fixture.eligibility,
      verdict: 'not_eligible',
      reasoning: 'The role is only open to people based in EMEA (Europe, the Middle East or Africa), and your country is outside it.',
    },
  };
}

/** Deep-partial snapshots in streaming order: job → eligibility → requirements → gaps → red flags. */
function analysisSnapshots(f: AnalysisLLM): unknown[] {
  const snaps: unknown[] = [];
  snaps.push({ job: { title: f.job.title } });
  const base = { job: f.job, candidateLevel: f.candidateLevel };
  snaps.push({ ...base, eligibility: { verdict: f.eligibility.verdict } });
  for (const reasoning of wordPrefixes(f.eligibility.reasoning, 8)) {
    snaps.push({ ...base, eligibility: { ...f.eligibility, reasoning } });
  }
  const withElig = { ...base, eligibility: f.eligibility };
  f.requirements.forEach((req, i) => {
    const done = f.requirements.slice(0, i);
    snaps.push({ ...withElig, requirements: [...done, { text: req.text, type: req.type }] });
    snaps.push({ ...withElig, requirements: [...done, req] });
  });
  const withReqs = { ...withElig, requirements: f.requirements };
  f.gaps.forEach((_, i) => snaps.push({ ...withReqs, gaps: f.gaps.slice(0, i + 1) }));
  snaps.push({ ...withReqs, gaps: f.gaps, redFlags: f.redFlags });
  return snaps;
}
