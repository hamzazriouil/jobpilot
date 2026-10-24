import { describe, expect, it } from 'vitest';
import { checkHonesty } from '@jobpilot/core/honesty';
import { SAMPLE_ANALYSIS_FIXTURE, SAMPLE_CV, SAMPLE_JOB } from '@jobpilot/core/prompts';
import { toAnalysisResultDetailed } from '@jobpilot/core/scoring';
import {
  DEMO_BAND,
  DEMO_COVER_LETTER,
  DEMO_EVIDENCE,
  DEMO_HONESTY_FLAGS,
  DEMO_LINES,
  DEMO_MUST,
  DEMO_SCORE,
  type DemoClaimLine,
} from './demo-trace';

// The landing demo must only show what the real sample produces (docs/08-BRAND-UI.md §6.3).

const ctx = { cvText: SAMPLE_CV, jobText: SAMPLE_JOB };
const detail = toAnalysisResultDetailed(SAMPLE_ANALYSIS_FIXTURE, ctx, {
  provider: 'fixture',
  model: 'fixture',
  promptVersion: 'fixture',
});
const claims = DEMO_LINES.filter((l): l is DemoClaimLine => l.kind === 'claim');

/** Fixture requirement each demo requirement line stands for, in order. */
const REQUIREMENT_REFS = [
  'Experience integrating LLM APIs into real product features',
  '1+ year of professional experience building web products',
  'Hands-on retrieval-augmented generation (embeddings, vector search)',
  'Building evals or prompt test sets',
];

describe('landing demo trace', () => {
  it('quotes the sample verbatim', () => {
    const quotes = claims.flatMap((l) => (l.quote ? [l.quote] : []));
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      expect(q.from === 'cv' ? SAMPLE_CV : SAMPLE_JOB).toContain(q.text);
    }
  });

  it('matches the fixture statuses', () => {
    const [first, ...requirements] = claims;
    const location = first!;
    expect(location.key).toBe('location');
    expect(location.status).toBe(SAMPLE_ANALYSIS_FIXTURE.eligibility.verdict);
    expect(SAMPLE_ANALYSIS_FIXTURE.eligibility.evidenceQuote).toContain(location.quote?.text);
    expect(requirements).toHaveLength(REQUIREMENT_REFS.length);
    requirements.forEach((line, i) => {
      const req = SAMPLE_ANALYSIS_FIXTURE.requirements.find((r) => r.text === REQUIREMENT_REFS[i]);
      expect(req, REQUIREMENT_REFS[i]).toBeDefined();
      expect(line.key).toBe(req!.type);
      expect(line.status).toBe(req!.status);
      if (line.quote) expect(req!.evidenceQuote).toContain(line.quote.text);
      if (line.note) expect(req!.note).toContain(line.note);
    });
  });

  it('shows the score and band the fixture scores to', () => {
    expect(detail.result.score).toBe(DEMO_SCORE);
    expect(detail.result.band).toBe(DEMO_BAND);
    expect(detail.breakdown.must.met).toBe(DEMO_MUST.met);
    expect(detail.breakdown.must.total).toBe(DEMO_MUST.total);
  });

  it('reports the evidence check honestly', () => {
    const quoted =
      SAMPLE_ANALYSIS_FIXTURE.requirements.filter((r) => r.evidenceQuote).length +
      (SAMPLE_ANALYSIS_FIXTURE.eligibility.evidenceQuote ? 1 : 0);
    // `downgrades` counts dropped requirement quotes plus the eligibility quote (0 or 1).
    const dropped = detail.evidence.downgrades;
    expect(DEMO_EVIDENCE.total).toBe(quoted);
    expect(DEMO_EVIDENCE.dropped).toBe(dropped);
    expect(DEMO_EVIDENCE.verified).toBe(quoted - dropped);
  });

  it('uses a cover-letter line the honesty check accepts', () => {
    const flags = checkHonesty({ coverLetter: DEMO_COVER_LETTER, coldDm: '', cvBullets: [] }, ctx);
    expect(flags).toHaveLength(DEMO_HONESTY_FLAGS);
  });
});
