import { describe, expect, it } from 'vitest';
import { SAMPLE_CV, SAMPLE_JOB } from '../prompts';
import type { DraftsLLM } from '../schemas';
import { checkHonesty, findUnsupportedFacts, numberForms, prepareHonestySources } from './honesty';

// A draft a good model should write for SAMPLE_CV × SAMPLE_JOB: every fact is in the CV or the post.
const HONEST_DRAFTS: DraftsLLM = {
  coverLetter: `Hello,

At Kasbah Freight I built an internal shipment-tracking dashboard in React and TypeScript that the 12-person operations team used daily. Quillstack's drafting assistant sits at the same point where AI meets a real workflow, and that is the kind of feature I want to build.

I also built ClipCraft, a Python (FastAPI) tool that calls the Gemini and Claude APIs with structured JSON outputs, Pydantic validation and a small eval set of 25 transcripts. QuizLoop, my Next.js app on Cloudflare Workers with D1 and KV, reached 38,000 visitors in the first 10 days. I haven't built RAG with pgvector yet, and I'm keen to learn it.

Would you be open to a 30-minute intro call about the AI Product Engineer role?

Adam Benjelloun`,
  coldDm: `Hi, Quillstack's assistant for support teams caught my eye. I built ClipCraft, which turns transcripts into posts with the Gemini and Claude APIs and an eval set to compare prompt versions: https://adam.example.com. Open to a quick chat about the AI Product Engineer role?`,
  cvBullets: [
    {
      original: 'Built an internal shipment-tracking dashboard in React and TypeScript, used daily by the 12-person operations team.',
      improved: 'Shipped a React and TypeScript shipment-tracking dashboard used daily by the 12-person operations team.',
    },
    {
      original: 'Designed structured JSON outputs with Pydantic validation and an automatic retry on invalid output.',
      improved: 'Designed structured LLM outputs with Pydantic validation and automatic retries on invalid output.',
    },
    {
      original: 'Reached 38,000 visitors in the first 10 days after a TikTok post, with hosting kept at $0 on free tiers.',
      improved: 'Grew QuizLoop to 38k visitors in 10 days after a TikTok post while keeping hosting at $0 on Cloudflare free tiers.',
    },
  ],
};

describe('checkHonesty', () => {
  it('raises no flags on an honest draft for the sample pair', () => {
    expect(checkHonesty(HONEST_DRAFTS, { cvText: SAMPLE_CV, jobText: SAMPLE_JOB })).toEqual([]);
  });

  it('flags invented employers, numbers, years and links per draft', () => {
    const drafts: DraftsLLM = {
      coverLetter: 'Hello,\n\nAt Google I cut latency by 40% in 2023 while leading a team of 6 at Stripe.',
      coldDm: 'Hi, see my work at https://fake-portfolio.example.com and say hi at adam@acme.io.',
      cvBullets: [{ original: null, improved: 'Led the Kubernetes migration for 300+ support teams.' }],
    };
    const flags = checkHonesty(drafts, { cvText: SAMPLE_CV, jobText: SAMPLE_JOB });
    expect(flags).toEqual([
      { draft: 'coverLetter', text: '40' },
      { draft: 'coverLetter', text: '2023' },
      { draft: 'coverLetter', text: '6' },
      { draft: 'coverLetter', text: 'Google' },
      { draft: 'coverLetter', text: 'Stripe' },
      { draft: 'coldDm', text: 'https://fake-portfolio.example.com' },
      { draft: 'coldDm', text: 'adam@acme.io' },
      { draft: 'cvBullet', text: 'Kubernetes' },
    ]);
  });

  it('accepts company and product names from the job post, and flags them without it', () => {
    const drafts: DraftsLLM = {
      coverLetter: 'I would love to help Quillstack improve its retrieval pipeline for PostHog users.',
      coldDm: 'Hi,',
      cvBullets: [],
    };
    expect(checkHonesty(drafts, { cvText: SAMPLE_CV, jobText: SAMPLE_JOB })).toEqual([]);
    expect(checkHonesty(drafts, { cvText: SAMPLE_CV })).toEqual([
      { draft: 'coverLetter', text: 'Quillstack' },
      { draft: 'coverLetter', text: 'PostHog' },
    ]);
  });

  it('de-duplicates flags across CV bullets', () => {
    const drafts: DraftsLLM = {
      coverLetter: '',
      coldDm: '',
      cvBullets: [
        { original: null, improved: 'Used Kafka for events.' },
        { original: null, improved: 'Scaled Kafka consumers.' },
      ],
    };
    expect(checkHonesty(drafts, { cvText: SAMPLE_CV })).toEqual([{ draft: 'cvBullet', text: 'Kafka' }]);
  });
});

describe('findUnsupportedFacts', () => {
  const sources = prepareHonestySources({ cvText: SAMPLE_CV, jobText: SAMPLE_JOB });

  it('ignores sentence-initial common words, months, weekdays, greetings and I', () => {
    const text =
      'Recently I shipped a dashboard. Shipping fast matters to me! Dear hiring team, I am free on Monday in March.\nBest regards,\nAdam';
    expect(findUnsupportedFacts(text, sources)).toEqual([]);
  });

  it('checks names with inner capitals or digits even at a sentence start', () => {
    expect(findUnsupportedFacts('GraphQL is new to me. TypeScript is not. D1 and R2 too.', sources)).toEqual([
      'GraphQL',
      'R2',
    ]);
  });

  it('groups adjacent unknown names, including an unknown sentence-initial word', () => {
    expect(findUnsupportedFacts('Acme Labs hired me. I worked with Blue Ocean Partners.', sources)).toEqual([
      'Acme Labs',
      'Blue Ocean Partners',
    ]);
  });

  it('accepts an acronym whose expansion is in a source, and flags an unexplained one', () => {
    expect(findUnsupportedFacts('I am keen to learn RAG. I also know the SDK.', sources)).toEqual(['SDK']);
  });

  it('tolerates possessives, plurals and hyphenated compounds', () => {
    expect(findUnsupportedFacts("Quillstack's team uses LLM APIs and a Claude-powered tool on Workers.", sources)).toEqual([]);
  });

  it('matches numbers across thousands separators and k suffixes', () => {
    expect(findUnsupportedFacts('38k visitors, 38,000 visitors, 12-person team, 7 months, 2025.', sources)).toEqual(['7']);
  });

  it('does not re-check the parts of a known link', () => {
    expect(findUnsupportedFacts('Live at https://quizloop.example.com/ and github.com/example-adam.', sources)).toEqual([]);
  });
});

describe('numberForms', () => {
  it('normalizes separators and expands k', () => {
    expect(numberForms('38,000')).toEqual(['38000']);
    expect(numberForms('38k')).toEqual(['38', '38000']);
    expect(numberForms('1.5k')).toEqual(['1.5', '1500']);
    expect(numberForms('2025')).toEqual(['2025']);
  });
});
