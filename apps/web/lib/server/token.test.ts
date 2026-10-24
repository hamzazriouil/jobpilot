import { describe, expect, it } from 'vitest';
import { SAMPLE_ANALYSIS_FIXTURE, SAMPLE_CV, SAMPLE_JOB } from '@jobpilot/core/prompts';
import type { AnalysisResult } from '@jobpilot/core/schemas';
import { fromBase64Url, timingSafeEqual, toBase64Url } from './crypto';
import { ANALYSIS_TOKEN_TTL_MS, signAnalysisToken, verifyAnalysisToken } from './token';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
const RESULT: AnalysisResult = {
  ...SAMPLE_ANALYSIS_FIXTURE,
  score: 77,
  band: 'good',
  evidenceDowngrades: 0,
  provider: 'gemini',
  model: 'gemini-3.6-flash',
  promptVersion: 'analyze.v1',
};
const TEXTS = { cvText: SAMPLE_CV, jobText: SAMPLE_JOB };
const NOW = 1_800_000_000_000;

describe('analysisToken', () => {
  it('round-trips the analysis and tolerates surrounding whitespace in the texts', async () => {
    const token = await signAnalysisToken(RESULT, TEXTS, SECRET, NOW);
    const v = await verifyAnalysisToken(token, { cvText: `  ${SAMPLE_CV}\n`, jobText: SAMPLE_JOB }, SECRET, NOW + 1000);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.payload.result).toEqual(RESULT);
      expect(v.payload.v).toBe(1);
      expect(v.payload.exp).toBe(NOW + ANALYSIS_TOKEN_TTL_MS);
    }
  });

  it('fits a 20-requirement analysis under the 20k DraftRequest cap', async () => {
    const req = RESULT.requirements[0]!;
    const big: AnalysisResult = {
      ...RESULT,
      requirements: Array.from({ length: 20 }, (_, i) => ({
        ...req,
        text: `${i} ${'x'.repeat(150)}`.slice(0, 160),
        note: `${i} ${'note '.repeat(40)}`.slice(0, 200),
      })),
    };
    const token = await signAnalysisToken(big, TEXTS, SECRET, NOW);
    expect(token.length).toBeLessThan(20_000);
    expect((await verifyAnalysisToken(token, TEXTS, SECRET, NOW)).ok).toBe(true);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signAnalysisToken(RESULT, TEXTS, 'other-secret', NOW);
    expect(await verifyAnalysisToken(token, TEXTS, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a tampered payload', async () => {
    const token = await signAnalysisToken(RESULT, TEXTS, SECRET, NOW);
    const [body, sig] = token.split('.') as [string, string];
    const flipped = body.slice(0, 10) + (body[10] === 'A' ? 'B' : 'A') + body.slice(11);
    expect(await verifyAnalysisToken(`${flipped}.${sig}`, TEXTS, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects an expired token', async () => {
    const token = await signAnalysisToken(RESULT, TEXTS, SECRET, NOW);
    expect(await verifyAnalysisToken(token, TEXTS, SECRET, NOW + ANALYSIS_TOKEN_TTL_MS)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a token for a different CV or job', async () => {
    const token = await signAnalysisToken(RESULT, TEXTS, SECRET, NOW);
    const otherCv = { cvText: `${SAMPLE_CV} extra`, jobText: SAMPLE_JOB };
    const otherJob = { cvText: SAMPLE_CV, jobText: `${SAMPLE_JOB} extra` };
    expect(await verifyAnalysisToken(token, otherCv, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(await verifyAnalysisToken(token, otherJob, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects garbage without throwing', async () => {
    for (const t of ['', 'abc', 'a.b.c', 'not base64!.x', '.', 'abc.']) {
      expect((await verifyAnalysisToken(t, TEXTS, SECRET, NOW)).ok).toBe(false);
    }
  });
});

describe('crypto helpers', () => {
  it('base64url round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array(Array.from({ length: 300 }, (_, i) => (i * 37) % 256));
    const s = toBase64Url(bytes);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(s)).toEqual(bytes);
    expect(fromBase64Url('a+b/')).toBeNull();
  });

  it('timingSafeEqual compares bytes and lengths', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
