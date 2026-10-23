import { describe, expect, it } from 'vitest';
import { AnalysisResult, type AnalysisLLM, type Requirement } from '../schemas';
import { NO_EVIDENCE_NOTE, applyEvidenceCheck, normalizeForMatch, quoteFoundIn } from './evidence';
import { computeScore } from './score';
import { toAnalysisResult } from './result';

const CV = `Omar B. | Full-stack developer | Casablanca, Morocco

PROJECTS
â€¢ Built RARE, a Next.js + Cloudflare app used by 2,000 collectors â€” real-time rarity scores.
â€¢ Led a team of four engineers at Acme to ship a React Native app (2023â€“2024).

SKILLS
TypeScript, JavaScript, React, Node.js, PostgreSQL, CafÃ©-ordering bots.`;

const JOB = `Senior-ish Full-stack Engineer at Globex. We're a remote-first company.
Location: This role is open to candidates anywhere in the EMEA region (contractors welcome).
You have 2+ years with TypeScript and React. Nice to have: Python / FastAPI.`;

function req(status: Requirement['status'], evidenceQuote: string | null, extra: Partial<Requirement> = {}): Requirement {
  return {
    text: 'TypeScript + React',
    type: 'must',
    category: 'tech',
    status,
    evidenceQuote,
    evidenceSource: status === 'missing' ? 'none' : 'project',
    note: 'LLM note',
    ...extra,
  };
}

function analysis(requirements: Requirement[], eligibility?: Partial<AnalysisLLM['eligibility']>): AnalysisLLM {
  return {
    job: { title: 'Full-stack Engineer', company: 'Globex', level: 'mid' },
    candidateLevel: 'junior',
    eligibility: {
      verdict: 'eligible',
      allowedRegions: ['EMEA'],
      evidenceQuote: 'This role is open to candidates anywhere in the EMEA region',
      reasoning: 'Morocco is in EMEA.',
      ...eligibility,
    },
    requirements,
    gaps: [{ skill: 'Python', howToClose: 'Build a FastAPI endpoint.' }],
    redFlags: [],
  };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

describe('normalizeForMatch', () => {
  it('lowercases, strips punctuation/symbols, folds accents, collapses whitespace', () => {
    expect(normalizeForMatch('  Built RARE,\n a  Next.js + Cloudflare app â€” CafÃ©!  ')).toBe('built rare a next js cloudflare app cafe');
  });
});

describe('quoteFoundIn', () => {
  it('finds an exact quote', () => {
    expect(quoteFoundIn('Built RARE, a Next.js + Cloudflare app used by 2,000 collectors', CV)).toBe(true);
  });

  it('finds a quote with different whitespace, case, punctuation and smart dashes', () => {
    expect(quoteFoundIn('built   RARE a next.js+cloudflare APP used by 2000 collectors', CV)).toBe(true); // "2000" vs "2,000": 10/11 tokens â†’ fuzzy
    expect(quoteFoundIn('built   RARE a next.js+cloudflare APP used by 2,000 collectors - real-time', CV)).toBe(true);
    expect(quoteFoundIn('â€œBuilt RAREâ€, a Next.js / Cloudflare app', CV)).toBe(true);
  });

  it('fuzzy: tolerates one added word in the quote (â‰¥85% of tokens in order)', () => {
    // 13 tokens, 12 present in order ("and" is not in the CV)
    expect(quoteFoundIn('Built RARE, a Next.js and Cloudflare app used by 2,000 collectors', CV)).toBe(true);
  });

  it('fuzzy: tolerates a word the quote skipped from the source', () => {
    expect(quoteFoundIn('Led a team of engineers at Acme', CV)).toBe(true); // source says "of four engineers"
  });

  it('rejects a fabricated quote', () => {
    expect(quoteFoundIn('Led the migration of a Kubernetes cluster to AWS EKS', CV)).toBe(false);
  });

  it('rejects out-of-order or too-different paraphrases', () => {
    expect(quoteFoundIn('collectors used RARE built with Cloudflare and Next.js', CV)).toBe(false);
  });

  it('matches on token boundaries only ("Java" is not in "JavaScript")', () => {
    expect(quoteFoundIn('Java', 'Skills: JavaScript, TypeScript')).toBe(false);
    expect(quoteFoundIn('TypeScript', 'Skills: JavaScript, TypeScript')).toBe(true);
  });

  it('null, empty and punctuation-only quotes are never found', () => {
    expect(quoteFoundIn(null, CV)).toBe(false);
    expect(quoteFoundIn('', CV)).toBe(false);
    expect(quoteFoundIn(' â€¦ ', CV)).toBe(false);
  });

  it('stays fast on a max-size source', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `the team shipped feature ${i} and the app`).join('. ');
    const t0 = performance.now();
    const found = quoteFoundIn('the team and the app shipped the feature with the team and the app and the team', big);
    expect(typeof found).toBe('boolean');
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('applyEvidenceCheck', () => {
  it('keeps requirements whose quotes are found', () => {
    const { analysis: out, downgrades } = applyEvidenceCheck(
      analysis([req('met', 'Built RARE, a Next.js + Cloudflare app'), req('partial', 'TypeScript, JavaScript, React')]),
      { cvText: CV, jobText: JOB },
    );
    expect(downgrades).toBe(0);
    expect(out.requirements.map((r) => r.status)).toEqual(['met', 'partial']);
    expect(out.eligibility.verdict).toBe('eligible');
  });

  it('downgrades a fabricated quote to missing with the fixed note', () => {
    const res = applyEvidenceCheck(
      analysis([req('met', 'Led the migration of a Kubernetes cluster to AWS EKS'), req('met', 'Built RARE')]),
      { cvText: CV, jobText: JOB },
    );
    expect(res.downgrades).toBe(1);
    expect(res.requirementDowngrades).toBe(1);
    expect(res.analysis.requirements[0]).toMatchObject({
      status: 'missing',
      note: NO_EVIDENCE_NOTE,
      evidenceQuote: null,
      evidenceSource: 'none',
    });
    expect(res.analysis.requirements[1]!.status).toBe('met');
  });

  it('downgrades met/partial with a null quote; leaves missing items alone', () => {
    const res = applyEvidenceCheck(analysis([req('partial', null), req('missing', null, { note: 'keep me' })]), {
      cvText: CV,
      jobText: JOB,
    });
    expect(res.downgrades).toBe(1);
    expect(res.analysis.requirements[0]!.status).toBe('missing');
    expect(res.analysis.requirements[1]).toMatchObject({ status: 'missing', note: 'keep me' });
  });

  it('forces eligibility to unclear when its quote is not in the job post', () => {
    const res = applyEvidenceCheck(
      analysis([req('met', 'Built RARE')], {
        verdict: 'not_eligible',
        allowedRegions: ['US'],
        evidenceQuote: 'Applicants must be located in the United States.',
      }),
      { cvText: CV, jobText: JOB },
    );
    expect(res.eligibilityDowngraded).toBe(true);
    expect(res.downgrades).toBe(1);
    expect(res.analysis.eligibility).toMatchObject({ verdict: 'unclear', evidenceQuote: null });
  });

  it('eligible/not_eligible with a null quote â†’ unclear; unclear stays unclear and is not counted', () => {
    const a = applyEvidenceCheck(analysis([req('met', 'Built RARE')], { evidenceQuote: null }), { cvText: CV, jobText: JOB });
    expect(a.analysis.eligibility.verdict).toBe('unclear');
    expect(a.downgrades).toBe(1);

    const b = applyEvidenceCheck(analysis([req('met', 'Built RARE')], { verdict: 'unclear', evidenceQuote: 'made up text here' }), {
      cvText: CV,
      jobText: JOB,
    });
    expect(b.analysis.eligibility).toMatchObject({ verdict: 'unclear', evidenceQuote: null });
    expect(b.downgrades).toBe(0);
  });

  it('checks eligibility against the JOB text, not the CV', () => {
    const res = applyEvidenceCheck(analysis([req('met', 'Built RARE')], { evidenceQuote: 'Casablanca, Morocco' }), {
      cvText: CV,
      jobText: JOB,
    });
    expect(res.analysis.eligibility.verdict).toBe('unclear');
  });

  it('does not mutate its input', () => {
    const input = deepFreeze(analysis([req('met', 'fabricated claim about Rust'), req('met', 'Built RARE')], { evidenceQuote: 'nope' }));
    const snapshot = structuredClone(input);
    const res = applyEvidenceCheck(input, { cvText: CV, jobText: JOB });
    expect(input).toEqual(snapshot);
    expect(res.analysis).not.toBe(input);
    expect(res.analysis.requirements[1]).not.toBe(input.requirements[1]);
    expect(res.downgrades).toBe(2);
  });
});

describe('toAnalysisResult', () => {
  it('runs the evidence check, scores the checked analysis and validates the result', () => {
    const llm = analysis([
      req('met', 'Built RARE, a Next.js + Cloudflare app'),
      req('met', 'Kubernetes on bare metal for 5 years'), // fabricated â†’ missing
      req('met', 'TypeScript, JavaScript, React', { type: 'nice', evidenceSource: 'skills_list' }),
    ]);
    const result = toAnalysisResult(llm, { cvText: CV, jobText: JOB }, { provider: 'gemini', model: 'flash', promptVersion: 'analyze.v1' });

    expect(AnalysisResult.safeParse(result).success).toBe(true);
    expect(result.evidenceDowngrades).toBe(1);
    expect(result.requirements[1]!.status).toBe('missing');
    expect(result).toMatchObject({ provider: 'gemini', model: 'flash', promptVersion: 'analyze.v1' });
    // score comes from the CHECKED analysis
    const expected = computeScore(result);
    expect(result.score).toBe(expected.score);
    expect(result.band).toBe(expected.band);
    // must 1/2 â†’ 25, nice 1 â†’ 15, seniority mid vs junior â†’ 7.5, stack 2/3 â†’ 6.67, evidence 1/2 â†’ 5 = 59.17
    expect(result.score).toBe(59);
    expect(result.band).toBe('stretch');
  });
});
