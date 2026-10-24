// Decorative data for the landing page's sample run (components/landing/demo-trace.tsx).
//
// HONESTY RULE (docs/08-BRAND-UI.md §6.3): nothing here is invented. Every quote is copied
// verbatim from SAMPLE_CV / SAMPLE_JOB, every status matches SAMPLE_ANALYSIS_FIXTURE, and the
// score is what that fixture scores to with toAnalysisResult (all in packages/core/src). The large
// sample texts are kept out of the client bundle on purpose: demo-trace.test.ts checks these lines
// against the real sources, so a change there fails the tests instead of silently drifting.
import type { FitBand } from '@jobpilot/core/schemas';

export type DemoStatus = 'eligible' | 'met' | 'partial' | 'missing';

export interface DemoQuote {
  /** Where the quote comes from: the CV (requirements) or the job post (eligibility). */
  from: 'cv' | 'job';
  /** Shown as `↳ <label>: “text”`. */
  label: string;
  text: string;
}

export interface DemoClaimLine {
  kind: 'claim';
  key: 'location' | 'must' | 'nice';
  status: DemoStatus;
  text: string;
  /** Short muted note after the text (not a quote). */
  note?: string;
  quote?: DemoQuote;
}

export type DemoLine = DemoClaimLine | { kind: 'check' } | { kind: 'score' };

export const DEMO_LINES: ReadonlyArray<DemoLine> = [
  {
    kind: 'claim',
    key: 'location',
    status: 'eligible',
    text: 'from Morocco',
    quote: { from: 'job', label: 'job', text: 'based anywhere in EMEA (Europe, the Middle East or Africa)' },
  },
  {
    kind: 'claim',
    key: 'must',
    status: 'met',
    text: 'LLM APIs in real product features',
    quote: { from: 'cv', label: 'cv/project', text: 'using the Gemini and Claude APIs' },
  },
  {
    kind: 'claim',
    key: 'must',
    status: 'partial',
    text: '1+ year of professional experience',
    note: '4-month internship',
  },
  {
    kind: 'claim',
    key: 'must',
    status: 'missing',
    text: 'Hands-on RAG (embeddings, vector search)',
  },
  {
    kind: 'claim',
    key: 'nice',
    status: 'met',
    text: 'Building evals or prompt test sets',
    quote: { from: 'cv', label: 'cv/project', text: 'Built a small eval set of 25 transcripts' },
  },
  { kind: 'check' },
  { kind: 'score' },
];

/** toAnalysisResult(SAMPLE_ANALYSIS_FIXTURE, …).score and .band (asserted in demo-trace.test.ts). */
export const DEMO_SCORE = 78;
export const DEMO_BAND: FitBand = 'good';

/** Must-haves in the fixture: 4 met of 6 (one partial, one missing). */
export const DEMO_MUST = { met: 4, total: 6 } as const;

/** Quotes the evidence check verified (8 requirement quotes + the eligibility quote), none dropped. */
export const DEMO_EVIDENCE = { verified: 9, total: 9, dropped: 0 } as const;

/** Opening of the cover letter in packages/core's honesty test; checkHonesty finds 0 flags in it. */
export const DEMO_COVER_LETTER =
  'Hello, at Kasbah Freight I built an internal shipment-tracking dashboard in React and TypeScript that the 12-person operations team used daily.';
export const DEMO_HONESTY_FLAGS = 0;
