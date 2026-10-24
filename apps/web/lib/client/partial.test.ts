import { describe, expect, it } from 'vitest';
import { SAMPLE_ANALYSIS_FIXTURE } from '@jobpilot/core/prompts';
import { sanitizeAnalysisPartial, sanitizeDraftsPartial } from './partial';

describe('sanitizeAnalysisPartial', () => {
  it('returns empty lists for non-objects', () => {
    for (const raw of [null, undefined, 'x', 42, []]) {
      expect(sanitizeAnalysisPartial(raw)).toEqual({ requirements: [], gaps: [], redFlags: [] });
    }
  });

  it('keeps a full analysis intact', () => {
    const out = sanitizeAnalysisPartial(SAMPLE_ANALYSIS_FIXTURE);
    // `category` isn't rendered, so the sanitizer doesn't keep it.
    expect(out.requirements).toEqual(SAMPLE_ANALYSIS_FIXTURE.requirements.map(({ category: _, ...rest }) => rest));
    expect(out.gaps).toEqual(SAMPLE_ANALYSIS_FIXTURE.gaps);
    expect(out.eligibility).toEqual(SAMPLE_ANALYSIS_FIXTURE.eligibility);
    expect(out.job).toEqual(SAMPLE_ANALYSIS_FIXTURE.job);
  });

  it('drops invalid enums and wrong types, keeps what is valid', () => {
    const out = sanitizeAnalysisPartial({
      eligibility: { verdict: 'maybe', reasoning: 42, evidenceQuote: null },
      requirements: [
        { text: 'TypeScript', status: 'met', type: 'must' },
        { text: 'Rust', status: 'kinda', type: 'required' },
        { status: 'met' }, // no text yet: skipped
        'garbage',
      ],
      gaps: [{ skill: 'RAG' }, { howToClose: 'no skill' }],
      redFlags: ['unpaid trial', 7, ''],
    });
    expect(out.eligibility).toEqual({ evidenceQuote: null });
    expect(out.requirements).toEqual([{ text: 'TypeScript', status: 'met', type: 'must' }, { text: 'Rust' }]);
    expect(out.gaps).toEqual([{ skill: 'RAG' }]);
    expect(out.redFlags).toEqual(['unpaid trial']);
  });
});

describe('sanitizeDraftsPartial', () => {
  it('keeps strings and partial bullets', () => {
    expect(
      sanitizeDraftsPartial({ coverLetter: 'Hi', coldDm: 5, cvBullets: [{ original: null, improved: 'Built' }, {}] }),
    ).toEqual({ coverLetter: 'Hi', cvBullets: [{ original: null, improved: 'Built' }, {}] });
  });
});
