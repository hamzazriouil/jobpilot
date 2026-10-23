import { describe, expect, it } from 'vitest';
import type { AnalysisLLM, Requirement, Seniority } from '../schemas';
import { bandForScore, clampScore, computeScore } from './score';

function req(
  type: Requirement['type'],
  status: Requirement['status'],
  opts: Partial<Requirement> = {},
): Requirement {
  return {
    text: `${type} requirement`,
    type,
    category: 'tech',
    status,
    evidenceQuote: status === 'missing' ? null : 'some quote',
    evidenceSource: status === 'missing' ? 'none' : 'experience',
    note: '',
    ...opts,
  };
}

function analysis(requirements: Requirement[], jobLevel: Seniority = 'mid', candidateLevel: Seniority = 'mid'): AnalysisLLM {
  return {
    job: { title: 'Full-stack developer', company: 'Acme', level: jobLevel },
    candidateLevel,
    eligibility: { verdict: 'eligible', allowedRegions: ['worldwide'], evidenceQuote: 'Remote worldwide', reasoning: '' },
    requirements,
    gaps: [],
    redFlags: [],
  };
}

describe('computeScore', () => {
  it('all met, same level → 100 / strong', () => {
    const out = computeScore(
      analysis([req('must', 'met'), req('must', 'met'), req('must', 'met'), req('nice', 'met', { evidenceSource: 'project' })]),
    );
    expect(out.score).toBe(100);
    expect(out.band).toBe('strong');
    expect(out.breakdown.must).toMatchObject({ total: 3, met: 3, ratio: 1, points: 50 });
    expect(out.breakdown.evidence).toMatchObject({ strong: 4, total: 4, points: 10 });
  });

  it('all missing with a 2-level seniority gap → 0 / long_shot', () => {
    const out = computeScore(analysis([req('must', 'missing'), req('must', 'missing'), req('nice', 'missing')], 'senior', 'junior'));
    expect(out.score).toBe(0);
    expect(out.band).toBe('long_shot');
    expect(out.breakdown.evidence).toMatchObject({ total: 0, ratio: 0, points: 0 });
  });

  it('all missing but same level → only the seniority points (15)', () => {
    const out = computeScore(analysis([req('must', 'missing'), req('nice', 'missing')]));
    expect(out.score).toBe(15);
  });

  it('empty nice set defaults to 0.5 (7.5 points)', () => {
    const out = computeScore(analysis([req('must', 'met'), req('must', 'met')]));
    expect(out.breakdown.nice).toMatchObject({ total: 0, ratio: 0.5, points: 7.5 });
    // 50 + 7.5 + 15 + 10 + 10 = 92.5 → 93
    expect(out.score).toBe(93);
  });

  it('empty must set defaults to 1 (50 points)', () => {
    const out = computeScore(analysis([req('nice', 'missing')]));
    expect(out.breakdown.must).toMatchObject({ total: 0, ratio: 1, points: 50 });
    // 50 + 0 + 15 + 0 (tech missing) + 0 = 65
    expect(out.score).toBe(65);
  });

  it('no tech requirements → stack defaults to 0.5 (5 points)', () => {
    const out = computeScore(
      analysis([req('must', 'met', { category: 'experience' }), req('nice', 'missing', { category: 'other' })]),
    );
    expect(out.breakdown.stack).toMatchObject({ total: 0, ratio: 0.5, points: 5 });
    // 50 + 0 + 15 + 5 + 10 = 80
    expect(out.score).toBe(80);
    expect(out.band).toBe('strong');
  });

  it('seniority diff: 0 → 15, 1 → 7.5, 2+ → 0, symmetric for over-qualified', () => {
    const reqs = [req('must', 'met')];
    expect(computeScore(analysis(reqs, 'mid', 'mid')).breakdown.seniority).toMatchObject({ diff: 0, points: 15 });
    expect(computeScore(analysis(reqs, 'mid', 'junior')).breakdown.seniority).toMatchObject({ diff: 1, points: 7.5 });
    expect(computeScore(analysis(reqs, 'senior', 'junior')).breakdown.seniority).toMatchObject({ diff: 2, points: 0 });
    expect(computeScore(analysis(reqs, 'lead', 'intern')).breakdown.seniority).toMatchObject({ diff: 4, points: 0 });
    expect(computeScore(analysis(reqs, 'junior', 'senior')).breakdown.seniority).toMatchObject({ diff: 2, points: 0 });
  });

  it('breakdown supports "Must-haves 4/6 met" and partial = 0.5', () => {
    const must = [
      ...Array.from({ length: 4 }, () => req('must', 'met')),
      req('must', 'partial', { evidenceSource: 'skills_list' }),
      req('must', 'missing'),
    ];
    const out = computeScore(analysis([...must, req('nice', 'met'), req('nice', 'missing'), req('nice', 'missing')], 'mid', 'junior'));
    expect(out.breakdown.must).toMatchObject({ total: 6, met: 4, partial: 1, missing: 1, ratio: 0.75, points: 37.5 });
    expect(out.breakdown.nice).toMatchObject({ total: 3, met: 1 });
    // met/partial = 4 met must + 1 partial must + 1 met nice = 6; strong = 5 (the partial is skills_list)
    expect(out.breakdown.evidence).toMatchObject({ total: 6, strong: 5 });
    // must 37.5 + nice 5 + seniority 7.5 + stack (5+0.5)/9·10 = 6.11 + evidence 5/6·10 = 8.33 = 64.44 → 64
    expect(out.score).toBe(64);
    expect(out.band).toBe('stretch');
  });

  it('evidence share counts only experience/project sources', () => {
    const out = computeScore(
      analysis([
        req('must', 'met', { evidenceSource: 'experience' }),
        req('must', 'met', { evidenceSource: 'skills_list' }),
        req('must', 'partial', { evidenceSource: 'education' }),
        req('must', 'met', { evidenceSource: 'project' }),
      ]),
    );
    expect(out.breakdown.evidence).toMatchObject({ strong: 2, total: 4, ratio: 0.5, points: 5 });
  });

  it('score is always an integer in [0, 100] across many combinations', () => {
    const statuses = ['met', 'partial', 'missing'] as const;
    const levels: Seniority[] = ['intern', 'junior', 'mid', 'senior', 'lead'];
    for (const a of statuses)
      for (const b of statuses)
        for (const c of statuses)
          for (const lvl of levels) {
            const { score, band } = computeScore(
              analysis([req('must', a), req('nice', b, { category: 'other' }), req('must', c, { category: 'language' })], lvl, 'mid'),
            );
            expect(Number.isInteger(score)).toBe(true);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
            expect(band).toBe(bandForScore(score));
          }
  });
});

describe('bandForScore / clampScore', () => {
  it.each([
    [0, 'long_shot'],
    [44, 'long_shot'],
    [45, 'stretch'],
    [64, 'stretch'],
    [65, 'good'],
    [79, 'good'],
    [80, 'strong'],
    [100, 'strong'],
  ] as const)('%i → %s', (score, band) => {
    expect(bandForScore(score)).toBe(band);
  });

  it('clamps to 0–100', () => {
    expect(clampScore(-12)).toBe(0);
    expect(clampScore(140)).toBe(100);
    expect(clampScore(Number.NaN)).toBe(0);
    expect(clampScore(57)).toBe(57);
  });
});
