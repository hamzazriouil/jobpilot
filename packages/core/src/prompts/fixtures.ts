// Hand-written AnalysisLLM for SAMPLE_CV × SAMPLE_JOB. Used to build the draft prompt
// without an LLM (scripts/try-prompts.ts, tests) and handy as a UI fixture.
// Every evidenceQuote is copied verbatim from SAMPLE_CV / SAMPLE_JOB (checked in prompts.test.ts).
// This is NOT a model output: it is what a correct analysis should roughly look like.

import type { AnalysisLLM } from '../schemas';

export const SAMPLE_ANALYSIS_FIXTURE: AnalysisLLM = {
  job: { title: 'AI Product Engineer (Junior–Mid)', company: 'Quillstack', level: 'junior' },
  candidateLevel: 'junior',
  eligibility: {
    verdict: 'eligible',
    allowedRegions: ['EMEA'],
    evidenceQuote: 'You can be based anywhere in EMEA (Europe, the Middle East or Africa).',
    reasoning:
      'The role is open to anyone in EMEA, and Morocco is in Africa. They also ask for 4 hours of overlap with CET, which fits your time zone.',
  },
  requirements: [
    {
      text: '1+ year of professional experience building web products',
      type: 'must',
      category: 'experience',
      status: 'partial',
      evidenceQuote: 'Software Engineering Intern, Kasbah Freight (logistics startup), Casablanca · Mar 2025 – Jun 2025',
      evidenceSource: 'experience',
      note: 'You have a 4-month internship plus shipped projects, but not a full year of paid experience.',
    },
    {
      text: 'Strong TypeScript and React',
      type: 'must',
      category: 'tech',
      status: 'met',
      evidenceQuote: 'Built an internal shipment-tracking dashboard in React and TypeScript',
      evidenceSource: 'experience',
      note: 'You used React and TypeScript in your internship and in your projects.',
    },
    {
      text: 'Experience integrating LLM APIs into real product features',
      type: 'must',
      category: 'tech',
      status: 'met',
      evidenceQuote: 'a newsletter draft using the Gemini and Claude APIs',
      evidenceSource: 'project',
      note: 'ClipCraft uses the Gemini and Claude APIs with structured outputs.',
    },
    {
      text: 'SQL and a relational database (PostgreSQL)',
      type: 'must',
      category: 'tech',
      status: 'met',
      evidenceQuote: 'Wrote a small Express REST API and SQL queries on PostgreSQL',
      evidenceSource: 'experience',
      note: 'You wrote SQL on PostgreSQL during your internship.',
    },
    {
      text: 'Hands-on retrieval-augmented generation (embeddings, vector search)',
      type: 'must',
      category: 'tech',
      status: 'missing',
      evidenceQuote: null,
      evidenceSource: 'none',
      note: 'No sign of embeddings, vector search or RAG in your CV.',
    },
    {
      text: 'Clear written English',
      type: 'must',
      category: 'language',
      status: 'met',
      evidenceQuote: 'English (professional working proficiency)',
      evidenceSource: 'skills_list',
      note: 'Your CV lists professional working proficiency in English.',
    },
    {
      text: 'Python for data and eval scripts',
      type: 'nice',
      category: 'tech',
      status: 'met',
      evidenceQuote: 'Python (FastAPI) tool that turns a long video transcript into a LinkedIn post',
      evidenceSource: 'project',
      note: 'ClipCraft is written in Python.',
    },
    {
      text: 'Building evals or prompt test sets',
      type: 'nice',
      category: 'tech',
      status: 'met',
      evidenceQuote: 'Built a small eval set of 25 transcripts to compare prompt versions',
      evidenceSource: 'project',
      note: 'You built an eval set for ClipCraft.',
    },
    {
      text: 'Edge platforms such as Cloudflare Workers',
      type: 'nice',
      category: 'tech',
      status: 'met',
      evidenceQuote: 'Built and launched a Next.js app on Cloudflare Workers with D1 and KV',
      evidenceSource: 'project',
      note: 'QuizLoop runs on Cloudflare Workers.',
    },
    {
      text: 'Product analytics and experimentation (PostHog, A/B tests)',
      type: 'nice',
      category: 'other',
      status: 'missing',
      evidenceQuote: null,
      evidenceSource: 'none',
      note: 'No product analytics or A/B testing in your CV.',
    },
    {
      text: 'Docker',
      type: 'nice',
      category: 'tech',
      status: 'missing',
      evidenceQuote: null,
      evidenceSource: 'none',
      note: 'No sign of Docker in your CV.',
    },
  ],
  gaps: [
    {
      skill: 'RAG with vector search',
      howToClose:
        'Add retrieval to ClipCraft or build a small help-center Q&A demo with embeddings and pgvector, deploy it, and add it to your CV with a link.',
    },
    {
      skill: 'Product analytics',
      howToClose:
        'Add PostHog to QuizLoop, track one funnel, run one small A/B test on the result page, and write down what you learned.',
    },
    {
      skill: 'Docker',
      howToClose: 'Write a Dockerfile for ClipCraft, run it locally with docker compose and Postgres, and mention it in the project bullet.',
    },
  ],
  redFlags: [],
};
