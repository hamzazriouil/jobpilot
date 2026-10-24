import { describe, expect, it } from 'vitest';
import { SAMPLE_ANALYSIS_FIXTURE } from '@jobpilot/core/prompts';
import { AnalysisLLM } from '@jobpilot/core/schemas';
import { AnalysisLLMTransport, finalizeAnalysis } from './analysis';
import { finalizeDrafts, trimToLength } from './drafts';

describe('finalizeAnalysis', () => {
  it('passes a valid analysis through unchanged', () => {
    expect(finalizeAnalysis(AnalysisLLMTransport.parse(SAMPLE_ANALYSIS_FIXTURE))).toEqual(SAMPLE_ANALYSIS_FIXTURE);
  });

  it('fills omitted nullable fields and clamps over-long text and arrays', () => {
    const raw = structuredClone(SAMPLE_ANALYSIS_FIXTURE) as Record<string, any>;
    delete raw.requirements[4].evidenceQuote; // a "missing" item, as llama often writes it
    delete raw.job.company;
    raw.eligibility.reasoning = 'Long sentence here. '.repeat(30);
    raw.requirements[0].note = 'x '.repeat(150);
    raw.gaps.push({ skill: 'Extra', howToClose: 'Do it.' });
    raw.redFlags = Array.from({ length: 7 }, (_, i) => `flag ${i}`);
    const out = finalizeAnalysis(AnalysisLLMTransport.parse(raw));
    expect(AnalysisLLM.safeParse(out).success).toBe(true);
    expect(out.requirements[4]!.evidenceQuote).toBeNull();
    expect(out.job.company).toBeNull();
    expect(out.eligibility.reasoning.length).toBeLessThanOrEqual(300);
    expect(out.eligibility.reasoning.endsWith('.')).toBe(true);
    expect(out.gaps).toHaveLength(3);
    expect(out.redFlags).toHaveLength(5);
  });

  it('still rejects broken enums', () => {
    const raw = structuredClone(SAMPLE_ANALYSIS_FIXTURE) as Record<string, any>;
    raw.requirements[0].status = 'great';
    expect(AnalysisLLMTransport.safeParse(raw).success).toBe(false);
  });
});

describe('finalizeDrafts', () => {
  it('trims to the DraftsLLM caps at a sentence or word boundary and keeps 3 bullets', () => {
    const d = finalizeDrafts({
      coverLetter: 'This is one sentence. '.repeat(100),
      coldDm: 'word '.repeat(200),
      cvBullets: Array.from({ length: 5 }, (_, i) => ({ original: null, improved: `b${i}` })),
    });
    expect(d.coverLetter.length).toBeLessThanOrEqual(1600);
    expect(d.coverLetter.endsWith('sentence.')).toBe(true);
    expect(d.coldDm.length).toBeLessThanOrEqual(600);
    expect(d.coldDm.endsWith('word')).toBe(true);
    expect(d.cvBullets).toHaveLength(3);
  });

  it('leaves short text alone', () => {
    expect(trimToLength('  short  ', 10)).toBe('short');
  });
});
