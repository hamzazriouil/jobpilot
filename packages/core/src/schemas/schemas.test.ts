import { describe, expect, it } from 'vitest';
import {
  AnalysisLLM,
  AnalysisResult,
  AnalyzeRequest,
  DraftRequest,
  DraftsLLM,
  Job,
  JobInput,
  ProfileLLM,
  SENIORITY_LEVEL,
} from './index';

const validAnalysis = {
  job: { title: 'AI Engineer', company: null, level: 'junior' },
  candidateLevel: 'junior',
  eligibility: {
    verdict: 'eligible',
    allowedRegions: ['worldwide'],
    evidenceQuote: 'Remote, worldwide',
    reasoning: 'Open worldwide.',
  },
  requirements: [
    {
      text: 'Python',
      type: 'must',
      category: 'tech',
      status: 'met',
      evidenceQuote: 'Built a FastAPI service',
      evidenceSource: 'project',
      note: '',
    },
  ],
  gaps: [{ skill: 'Docker', howToClose: 'Containerize a project.' }],
  redFlags: [],
};

describe('AnalysisLLM / AnalysisResult', () => {
  it('parses a valid fixture', () => {
    expect(AnalysisLLM.parse(validAnalysis)).toEqual(validAnalysis);
    const result = { ...validAnalysis, score: 72, band: 'good', evidenceDowngrades: 0, provider: 'gemini', model: 'm', promptVersion: 'analyze.v1' };
    expect(AnalysisResult.safeParse(result).success).toBe(true);
  });

  it('rejects invalid fixtures', () => {
    expect(AnalysisLLM.safeParse({ ...validAnalysis, requirements: [] }).success).toBe(false);
    expect(AnalysisLLM.safeParse({ ...validAnalysis, candidateLevel: 'principal' }).success).toBe(false);
    expect(
      AnalysisLLM.safeParse({ ...validAnalysis, eligibility: { ...validAnalysis.eligibility, reasoning: 'x'.repeat(301) } }).success,
    ).toBe(false);
    expect(AnalysisLLM.safeParse({ ...validAnalysis, gaps: Array(4).fill(validAnalysis.gaps[0]) }).success).toBe(false);
    const base = { ...validAnalysis, band: 'good', evidenceDowngrades: 0, provider: 'p', model: 'm', promptVersion: 'v' };
    expect(AnalysisResult.safeParse({ ...base, score: 101 }).success).toBe(false);
    expect(AnalysisResult.safeParse({ ...base, score: 70.5 }).success).toBe(false);
    expect(AnalysisResult.safeParse({ ...base, score: 70, band: 'great' }).success).toBe(false);
  });

  it('SENIORITY_LEVEL matches the rubric', () => {
    expect(SENIORITY_LEVEL).toEqual({ intern: 0, junior: 1, mid: 2, senior: 3, lead: 4 });
  });
});

describe('DraftsLLM', () => {
  it('allows at most 3 CV bullets and enforces lengths', () => {
    const ok = { coverLetter: 'Hi', coldDm: 'Hey', cvBullets: [{ original: null, improved: 'Shipped X' }] };
    expect(DraftsLLM.safeParse(ok).success).toBe(true);
    expect(DraftsLLM.safeParse({ ...ok, cvBullets: Array(4).fill(ok.cvBullets[0]) }).success).toBe(false);
    expect(DraftsLLM.safeParse({ ...ok, coldDm: 'x'.repeat(601) }).success).toBe(false);
  });
});

describe('API requests', () => {
  const cv = 'c'.repeat(200);
  const job = 'j'.repeat(200);

  it('AnalyzeRequest enforces size limits and uppercases the country', () => {
    expect(AnalyzeRequest.parse({ cvText: cv, jobText: job, country: 'ma' }).country).toBe('MA');
    expect(AnalyzeRequest.safeParse({ cvText: cv.slice(1), jobText: job, country: 'MA' }).success).toBe(false);
    expect(AnalyzeRequest.safeParse({ cvText: 'c'.repeat(20_001), jobText: job, country: 'MA' }).success).toBe(false);
    expect(AnalyzeRequest.safeParse({ cvText: cv, jobText: 'j'.repeat(15_001), country: 'MA' }).success).toBe(false);
    expect(AnalyzeRequest.safeParse({ cvText: cv, jobText: job, country: 'MAR' }).success).toBe(false);
    expect(AnalyzeRequest.safeParse({ cvText: cv, jobText: job, country: 'M1' }).success).toBe(false);
    // whitespace padding doesn't count toward the minimum
    expect(AnalyzeRequest.safeParse({ cvText: `${'c'.repeat(150)}${' '.repeat(100)}`, jobText: job, country: 'MA' }).success).toBe(false);
  });

  it('DraftRequest requires an analysis token', () => {
    expect(DraftRequest.safeParse({ cvText: cv, jobText: job, analysisToken: 'abc.def' }).success).toBe(true);
    expect(DraftRequest.safeParse({ cvText: cv, jobText: job, analysisToken: '' }).success).toBe(false);
  });
});

describe('ProfileLLM', () => {
  it('parses a CV-parser fixture and rejects a bad seniority', () => {
    const profile = {
      skills: ['TypeScript', 'React'],
      experiences: [{ title: 'Developer', org: 'Acme', start: '2023-04', end: null, summary: 'Built the dashboard.' }],
      projects: [{ name: 'RARE', url: 'https://howrare.fun', summary: 'NFT rarity tool', tech: ['Next.js', 'Cloudflare'] }],
      education: [{ institution: 'ENSIAS', degree: 'BSc', field: 'Computer Science', start: '2019', end: '2022' }],
      seniorityGuess: 'junior',
      languages: [{ language: 'English', level: 'fluent' }],
    };
    expect(ProfileLLM.parse(profile)).toEqual(profile);
    expect(ProfileLLM.safeParse({ ...profile, seniorityGuess: 'expert' }).success).toBe(false);
  });
});

describe('Job / JobInput', () => {
  it('JobInput applies defaults; Job validates a full row', () => {
    const input = JobInput.parse({ sourceId: 'user_paste', title: ' AI Engineer ', description: 'Build agents.' });
    expect(input).toMatchObject({ title: 'AI Engineer', allowedRegions: [], tags: [], seniority: null, ownerId: null });

    const row = {
      ...input,
      id: '0b8f6a3e-6a0a-4f5e-9a51-2f1c3d4e5f60',
      contentHash: 'abc',
      embedding: null,
      ingestedAt: '2026-10-23T06:00:00.000000+00:00',
    };
    expect(Job.safeParse(row).success).toBe(true);
    expect(Job.safeParse({ ...row, eligibilityType: 'anywhere' }).success).toBe(false);
    expect(Job.safeParse({ ...row, embedding: [0.1, 0.2] }).success).toBe(false);
  });
});
