/**
 * All English UI copy lives here (docs/05-ARCHITECTURE.md §3).
 * Components must not hard-code user-facing text. Adding French later means
 * adding a second object with the same shape.
 *
 * The brand name and tagline come from packages/core/brand.ts, never from here.
 * Tone rules: docs/03-UI-UX.md §7 (second person, short sentences, calm, never "Rejected").
 */
import { BRAND_NAME, BRAND_TAGLINE, SOURCE_URL, SUPPORT_EMAIL } from '@jobpilot/core/brand';

const num = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

export const strings = {
  meta: {
    title: `${BRAND_NAME}: ${BRAND_TAGLINE}`,
    description:
      'Paste your CV and a remote job post. Find out if you can apply from your country, get an honest fit score, and a ready-to-send cover letter and cold DM.',
  },
  header: {
    brand: BRAND_NAME,
    homeAriaLabel: `${BRAND_NAME} home`,
  },
  theme: {
    /** Button label; announces the current mode and what a click does. */
    toggleAriaLabel: (current: string, next: string) => `Theme: ${current}. Switch to ${next}.`,
    names: { system: 'system', light: 'light', dark: 'dark' },
  },
  hero: {
    title: BRAND_TAGLINE,
    subtitle:
      'Paste your CV and a job post. In 30 seconds: whether you can apply from your country, an honest fit score, and a ready-to-send cover letter and cold DM.',
    // Accurate claim: not saved on OUR servers; it is sent to an AI provider (see /privacy).
    trustLine: 'No signup · Not saved on our servers · Sent to an AI provider to analyze',
    sampleButton: 'Try with a sample',
    sampleLoading: 'Loading sample…',
    sampleHint: 'Fills in a sample CV and job post, then runs the analysis.',
  },
  analyzer: {
    sectionAriaLabel: 'Job fit analyzer',
    cvLabel: 'Your CV',
    cvPlaceholder: 'Paste the text of your CV…',
    jobLabel: 'Job post',
    jobPlaceholder: 'Paste the full job post, including the location and requirements…',
    charCount: (n: number, max: number) => `${num(n)} / ${num(max)}`,
    minHint: (min: number) => `At least ${num(min)} characters.`,
    tooShort: (min: number, n: number) => `Add a bit more: at least ${num(min)} characters (now ${num(n)}).`,
    tooLong: (max: number) => `Too long: keep it under ${num(max)} characters.`,
    rememberLabel: 'Remember my CV on this device',
    rememberHint: 'Saved only in this browser, never on our servers. Uncheck to delete it.',
    rememberUnavailable: "Your browser blocks local storage, so we can't remember your CV here.",
    countryLabel: 'I live in',
    countryHint: 'Used only to check whether you can apply.',
    countryPlaceholder: 'Choose your country',
    submit: 'Analyze',
    stop: 'Stop',
    disabledHint: 'Paste your CV and the job post (200+ characters each) to analyze.',
    quotaHint: '3 free analyses a day',
    devMockBadge: (scenario: string) => `Dev mock: ${scenario}`,
  },
  progress: {
    readingJob: 'Reading the job post…',
    checkingEligibility: 'Checking eligibility…',
    matchingRequirements: 'Matching your CV to the requirements…',
    scoring: 'Scoring…',
    writingDrafts: 'Writing your drafts…',
  },
  results: {
    heading: 'Your results',
    jobLine: (title: string, company: string | null | undefined) => (company ? `${title} · ${company}` : title),
    meta: (model: string, promptVersion: string) => `Model: ${model} · Prompt: ${promptVersion}`,
    levels: { intern: 'Intern', junior: 'Junior', mid: 'Mid', senior: 'Senior', lead: 'Lead' },
    sources: {
      experience: 'experience',
      project: 'project',
      skills_list: 'skills list',
      education: 'education',
      none: 'none',
      jobPost: 'job post',
    },
    from: 'from:',
    eligibility: {
      title: 'Eligibility',
      eligible: (country: string) => `Eligible from ${country}`,
      unclear: 'Unclear, check with the recruiter',
      notEligible: (country: string) => `Not eligible from ${country}`,
      openTo: 'Open to:',
      guidanceUnclear: "The post doesn't say clearly where you can work from. Ask the recruiter before you spend time on it.",
      guidanceNotEligible: 'Skip it, or ask the recruiter if they hire contractors in your country.',
    },
    fit: {
      title: 'Fit',
      bands: { strong: 'Strong fit', good: 'Good fit', stretch: 'Stretch', long_shot: 'Long shot' },
      bandHints: {
        strong: 'You match this role well. Apply soon.',
        good: 'A solid match with a few gaps. Worth applying.',
        stretch: 'Some important gaps. Apply if you can show how you would close them.',
        long_shot: "Long shot, but here's what would change that.",
      },
      scoreAriaLabel: (score: number, band: string) => `Fit score ${score} out of 100: ${band}`,
      outOf: '/ 100',
      mustHaves: 'Must-haves',
      niceToHaves: 'Nice-to-haves',
      seniority: 'Seniority',
      metCount: (met: number, total: number) => `${met}/${total} met`,
      levelChange: (you: string, role: string) => `${you} → ${role}`,
      levelChangeAriaLabel: (you: string, role: string) => `You: ${you}. Role: ${role}.`,
      dimmedNote: 'Fit shown for reference.',
      scoring: 'Scoring in code once the analysis is complete…',
      downgrades: (n: number) =>
        `We double-check every quote. ${plural(n, 'claim', 'claims')} couldn't be found in your CV or the job post, so we didn't count ${n === 1 ? 'it' : 'them'}.`,
    },
    requirements: {
      title: 'Requirements',
      status: { met: 'Met', partial: 'Partly met', missing: 'Missing' },
      pending: 'Checking',
      type: { must: 'must', nice: 'nice' },
      showAll: (n: number) => `Show all ${n}`,
      showFewer: 'Show fewer',
    },
    gaps: {
      title: 'Close the gap',
      empty: 'No big gaps found.',
    },
    redFlags: {
      title: 'Red flags',
      flagAriaLabel: 'Red flag',
    },
  },
  drafts: {
    title: 'Your drafts',
    tabs: { coverLetter: 'Cover letter', coldDm: 'Cold DM', cvBullets: 'CV bullets' },
    tabsAriaLabel: 'Draft type',
    flaggedSr: '(has something to check)',
    copy: 'Copy',
    copyAll: 'Copy all',
    copied: 'Copied',
    copiedAnnouncement: 'Copied to clipboard.',
    copyFailed: "Couldn't copy. Select the text and copy it yourself.",
    redo: 'Redo',
    redoHint: 'Writes new drafts. Uses one of your daily redos.',
    disclaimer: "Review before sending. You're responsible for what you submit.",
    factsNote: 'We only used facts from your CV.',
    honestyTitle: 'Please check this before sending',
    honestyBody: (items: string) => `We may have added something that isn't in your CV: ${items}.`,
    bulletBefore: 'Before',
    bulletAfter: 'Suggested',
    bulletCopyAriaLabel: (n: number) => `Copy bullet ${n}`,
    writing: 'Writing…',
    empty: 'Nothing here yet.',
  },
  states: {
    retry: 'Try again',
    restart: 'Start again',
    internal: { title: 'Something broke on our side.', body: 'Your inputs are still here. Try again in a moment.' },
    network: { title: "We couldn't reach the server.", body: 'Check your connection and try again. Your inputs are kept.' },
    busy: { title: 'High demand right now.', body: 'Try again in a minute. Your inputs are kept.' },
    quota: {
      title: "You've used today's free analyses.",
      body: 'They reset tomorrow. Free accounts with more analyses a day are coming soon.',
    },
    draftQuota: {
      title: "You've reached today's limit for drafts.",
      body: 'Your analysis is still here. Come back tomorrow for new drafts.',
    },
    badInput: { title: 'Please check your input.', fallback: 'One of the fields is too short or too long.' },
    aborted: { title: 'Stopped.', body: 'What you see below is incomplete.' },
    incomplete: { title: 'The answer was cut off.', body: 'What you see below is incomplete. Try again.' },
    partialNote: 'Results below are incomplete.',
  },
  announcements: {
    analysisStarted: 'Analyzing. Results will appear below.',
    analysisDone: (verdict: string, band: string, score: number) =>
      `Analysis ready. ${verdict}. ${band}, ${score} out of 100.`,
    draftsDone: 'Your drafts are ready.',
  },
  landing: {
    howItWorks: {
      title: 'How it works',
      steps: [
        {
          title: 'Paste',
          body: 'Your CV and a remote job post. No account needed.',
        },
        {
          title: 'Check',
          body: 'An AI model reads both and quotes its evidence. Code then verifies every quote and computes the score, so the number is never made up.',
        },
        {
          title: 'Apply',
          body: 'Get a cover letter, a cold DM and stronger CV bullets that only use facts from your CV.',
        },
      ],
    },
    whatWeCheck: {
      title: 'What we check',
      items: [
        'Whether the company hires from your country',
        'Each must-have and nice-to-have, with a quote from your CV',
        'Seniority: your level against the role',
        'Red flags such as unpaid trials',
      ],
    },
    privacy: {
      title: 'Privacy in one line',
      body: 'We send your CV and the job post to an AI provider (Google Gemini or Cloudflare Workers AI) to run the analysis. We don\'t save them on our servers. Google\'s free tier may keep and review what it receives, so remove details you don\'t want to share. "Remember my CV" keeps it only in your browser.',
      linkLabel: 'Read the Privacy Policy',
      linkHref: '/privacy',
    },
    faq: {
      title: 'Questions',
      items: [
        {
          q: 'Is the score reliable?',
          a: 'The AI only judges each requirement and must quote your CV as proof. Quotes we cannot find are not counted. The score itself is computed by fixed rules in code.',
        },
        {
          q: 'Why does my country matter?',
          a: 'Many "remote" jobs only hire in some countries. We check the post so you don\'t spend time on jobs you can\'t get.',
        },
        {
          q: 'Will the drafts invent experience?',
          a: 'They are told to use only facts from your CV. If a draft mentions a name or number we can\'t find in your CV, we highlight it so you can check.',
        },
        {
          q: 'What happens to my CV?',
          a: 'We send it, with the job post, to one AI provider to produce your analysis: Google Gemini (free tier) for most visitors, or Cloudflare Workers AI in the EEA, UK and Switzerland. We don\'t save it on our servers. On its free tier, Google may use what it receives to improve its products and people may review it. We only keep a daily-changing scrambled IP to count free analyses, and technical logs with no CV text.',
        },
      ],
    },
  },
  footer: {
    navAriaLabel: 'Footer',
    builtWith: 'Built with Claude Code',
    /** Footer links. GitHub shows only once SOURCE_URL (packages/core/brand.ts) is set: the repo is private for now. */
    links: [
      { label: 'Pricing', href: '/pricing' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Refunds', href: '/refund' },
      { label: 'Contact', href: `mailto:${SUPPORT_EMAIL}` },
      ...(SOURCE_URL ? [{ label: 'GitHub', href: SOURCE_URL, external: true }] : []),
    ] as ReadonlyArray<{
      label: string;
      href: string;
      external?: boolean;
    }>,
    copyright: (year: number) => `© ${year} ${BRAND_NAME}`,
  },
} as const;

export type Strings = typeof strings;
