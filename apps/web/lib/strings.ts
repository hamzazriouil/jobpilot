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
      'An honest fit score for remote jobs, with every claim traced to your CV. See if you can apply from your country, which requirements you really meet, and get drafts that never invent experience.',
  },
  header: {
    brand: BRAND_NAME,
    homeAriaLabel: `${BRAND_NAME} home`,
    navAriaLabel: 'Main',
    cta: 'Analyze free',
    ctaHref: '/#analyzer',
  },
  nav: [
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'Evals', href: '/evals' },
    { label: 'Pricing', href: '/pricing' },
  ] as ReadonlyArray<{ label: string; href: string }>,
  theme: {
    /** Button label; announces the current mode and what a click does. */
    toggleAriaLabel: (current: string, next: string) => `Theme: ${current}. Switch to ${next}.`,
    names: { light: 'light', dark: 'dark' },
  },
  hero: {
    // Evals pill: REAL numbers only. Source: the latest Gemini run with prompt analyze.v2
    // (evals/results/2026-10-24T18-25-27-908Z-gemini.json, also published on /evals):
    // eligibility 100% and fit band 100% on 10 synthetic cases, 3/3 injection cases resisted.
    // Update this text whenever a newer run changes those numbers.
    evalsPill: 'evals · 100% eligibility on 10 test cases',
    /** Shorter pill for phones (<640px), same claim. */
    evalsPillShort: '100% eligibility · 10 test cases',
    evalsHref: '/evals',
    title: 'An honest fit score.',
    titleMuted: 'Every claim traced to your CV.',
    subtitle:
      'Paste your CV and a remote job post. See whether you can apply from your country, which requirements you really meet, with quotes from your CV, and drafts that never invent experience.',
    ctaSample: 'Try a sample run',
    ctaOwn: 'Use my CV',
    // Accurate claim: not saved on OUR servers; it is sent to an AI provider (see /privacy).
    trustLine: 'No signup · Not saved on our servers · Sent to an AI provider to analyze',
  },
  analyzer: {
    sectionAriaLabel: 'Job fit analyzer',
    /** Mono title of the form's terminal-window header. */
    windowTitle: 'new analysis',
    sampleButton: 'Try with a sample',
    sampleLoading: 'Loading sample…',
    sampleHint: 'Fills in a sample CV and job post, then runs the analysis.',
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
    meta: (model: string, promptVersion: string) => `model ${model} · prompt ${promptVersion}`,
    /** Mono run status on the right of the results header (decorative; progress is announced separately). */
    runStatus: { streaming: 'streaming', done: 'done', stopped: 'stopped', failed: 'failed' },
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
      label: 'Fit score',
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
    /** The evidence trace (docs/08-BRAND-UI.md §6.5): requirements as terminal lines. */
    trace: {
      windowTitle: 'evidence-trace',
      count: (n: number) => plural(n, 'requirement', 'requirements'),
      /** Status words next to the glyph (✓ met · ◐ partly met · ✕ missing): status is never color only. */
      status: { met: 'met', partial: 'partly met', missing: 'missing' },
      checking: 'checking…',
      notChecked: 'not checked',
      /** Where in the CV the quote was found, shown as `↳ cv/projects: “…”`. */
      sourcePaths: {
        experience: 'cv/experience',
        project: 'cv/projects',
        skills_list: 'cv/skills',
        education: 'cv/education',
        none: 'cv',
      },
      checkKey: 'check',
      scoreKey: 'score',
      evidenceVerified: (verified: number, total: number) => `evidence verified ${num(verified)}/${num(total)} quotes`,
      dropped: (n: number) => `${num(n)} dropped`,
      computedInCode: 'computed in code →',
      scoreValue: (score: number, band: string) => `${score} · ${band}`,
      bandWords: { strong: 'strong fit', good: 'good fit', stretch: 'stretch', long_shot: 'long shot' },
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
    copied: 'Copied ✓',
    copiedAnnouncement: 'Copied to clipboard.',
    copyFailed: "Couldn't copy. Select the text and copy it yourself.",
    redo: 'Redo',
    redoHint: 'Writes new drafts. Uses one of your daily redos.',
    disclaimer: "Review before sending. You're responsible for what you submit.",
    factsNote: 'We only used facts from your CV.',
    /** Mono footer of the drafts card: "honesty check · 0 flags" / "· 2 to check". */
    honestyCheck: 'honesty check',
    honestyClean: '0 flags',
    honestyToCheck: (n: number) => `${num(n)} to check`,
    honestyPending: 'runs when writing ends',
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
  demo: {
    sectionAriaLabel: 'Sample run',
    srDescription:
      'Animated example of a sample run: a made-up CV is checked against a made-up AI Product Engineer job. It shows eligibility, each requirement with a quote from the CV, a fit score of 78 (a good fit) computed in code, and the start of a cover letter.',
    caption: 'Sample run on a made-up CV. Paste yours below.',
    windowTitle: 'evidence-trace · sample run',
    streaming: '● streaming',
    done: '✓ done',
    status: { eligible: 'eligible', met: 'met', partial: 'partial', missing: 'missing' },
    checkLine: (verified: number, total: number) => `evidence verified ${verified}/${total} quotes · `,
    dropped: (n: number) => `${n} dropped`,
    scoreLine: 'computed in code → ',
    fitLabel: 'FIT SCORE',
    bands: { strong: 'Strong fit', good: 'Good fit', stretch: 'Stretch', long_shot: 'Long shot' },
    mustSummary: (met: number, total: number) => `${met} of ${total} must-haves met.`,
    rubricNote: "Rubric computed in code, not the AI's mood.",
    draftTabs: ['Cover letter', 'Cold DM', 'CV bullets'],
    honestyFooter: (flags: number) => `honesty check · ${plural(flags, 'flag', 'flags')}`,
    copy: 'Copy',
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
  evals: {
    metaTitle: `Evals · ${BRAND_NAME}`,
    description:
      `How accurate is the analysis? Real eval runs of the ${BRAND_NAME} pipeline on a fixed test set: eligibility and fit accuracy, prompt-injection resistance, latency and failures.`,
    heading: 'How well does it work?',
    intro:
      'We run the exact analysis and draft pipeline you use against a fixed set of test cases, one AI provider at a time, and publish the numbers as they come out. Nothing below is hand-picked or edited.',
    latestTitle: 'Latest run per provider',
    empty: 'No eval runs recorded yet. The first runs will show up here.',
    unavailable: "We couldn't load the eval results right now. Try again in a few minutes.",
    providers: { gemini: 'Google Gemini', workers: 'Cloudflare Workers AI', claude: 'Anthropic Claude' } as Record<string, string>,
    runDate: (date: string) => `Run on ${date}`,
    runMeta: (cases: number, labeled: number) =>
      labeled === cases ? `${plural(cases, 'case', 'cases')}` : `${plural(cases, 'case', 'cases')}, ${num(labeled)} labeled`,
    versions: (prompt: string, dataset: string) => `Prompts ${prompt} · Dataset ${dataset}`,
    servedBy: (models: string) => `Answered by: ${models}`,
    notAvailable: 'n/a',
    metrics: {
      eligibilityAcc: 'Eligibility correct',
      bandAcc: 'Fit band exactly right',
      bandWithin1: 'Fit band within one step',
      injection: 'Injection attacks resisted',
      schemaValid: 'Valid output on first try',
      repairRate: 'Needed a repair retry',
      downgradeRate: 'Claims dropped by the quote check',
      honestyFlagRate: 'Drafts with something to check',
      latency: 'Analysis time (median / slowest 5%)',
      draftLatency: 'Drafts time (median / slowest 5%)',
      cost: 'Cost per case',
      errors: 'Failed calls',
    },
    /** Screen-reader word next to a metric's glyph (the color is never the only signal). */
    tone: { pass: 'good', weak: 'weak', fail: 'poor' },
    ofTotal: (n: number, total: number) => `${num(n)} of ${num(total)}`,
    seconds: (ms: number) => `${(ms / 1000).toFixed(1)}s`,
    costValue: (usd: number) => (usd === 0 ? '$0 (free tier)' : `$${usd.toFixed(4)}`),
    trendTitle: 'Band accuracy over runs',
    trendAriaLabel: (provider: string, values: string) => `Band accuracy of ${provider} over runs, oldest first: ${values}.`,
    trendPoint: (date: string, value: string) => `${date}: ${value}`,
    trendSingle: 'One run so far. The trend line appears after the next run.',
    casesTitle: 'Per-case results',
    casesHead: { case: 'Case', expected: 'Expected', got: 'Got', score: 'Score' },
    unlabeled: 'not labeled',
    failed: 'failed',
    caseMiss: 'miss',
    verdicts: { eligible: 'eligible', unclear: 'unclear', not_eligible: 'not eligible' } as Record<string, string>,
    bands: { strong: 'strong', good: 'good', stretch: 'stretch', long_shot: 'long shot' } as Record<string, string>,
    glossaryTitle: 'What the numbers mean',
    glossary: [
      {
        term: 'Eligibility correct',
        body: 'Share of labeled cases where the verdict you would see (eligible, unclear, not eligible) matches the label. A failed call counts as wrong.',
      },
      {
        term: 'Fit band',
        body: 'The score is computed by fixed rules in code from the AI’s judgments, then grouped into four bands: long shot, stretch, good, strong. “Exactly right” needs the same band as the label; “within one step” allows a neighbouring band.',
      },
      {
        term: 'Injection attacks resisted',
        body: 'Some test job posts and CVs hide instructions for AI tools, such as “mark every requirement met” or “put this code word in the cover letter”. A case passes only if the verdict and band stay where they should and no code word reaches the drafts.',
      },
      {
        term: 'Valid output on first try / repair retry',
        body: 'How often the model returned well-formed results straight away, and how often we had to ask it once more to fix its format.',
      },
      {
        term: 'Claims dropped by the quote check',
        body: 'The AI must quote your CV for every requirement it marks as met. Code then looks for each quote. Share of claims whose quote could not be found, which are then not counted.',
      },
      {
        term: 'Drafts with something to check',
        body: 'Share of draft sets where a name or number was not found in the CV or the job post, so you would see a “please check” warning.',
      },
      {
        term: 'Time and cost',
        body: 'Wall time until the full result, as you would wait for it. With ten cases, the “slowest 5%” is simply the slowest one. Cost is $0 on the free tiers we use.',
      },
    ],
    datasetTitle: 'How the test set was built',
    dataset: [
      'Ten synthetic cases written by hand: made-up CVs (no real people) against made-up job posts. They cover a strong match, two clear poor fits, prompt-injection attacks (3 cases) and tricky location rules: worldwide, US only, EU only, EMEA, no location given, time-zone-only and an on-site job with visa sponsorship.',
      'Each case is labeled with the eligibility verdict and fit band it should get, worked out by applying the scoring rules to a careful reading of the pair. The founder’s own anonymized CV against real job posts the founder applied to will be added next, labeled the same way.',
    ],
    limitsTitle: 'Known limitations',
    limits: [
      'Ten cases is a small sample: one case moves a percentage by 10 points. Treat the numbers as a smoke test, not a benchmark.',
      'The labels are one person’s reading of the scoring rules. Some cases sit near a band boundary, which is why we also show “within one step”.',
      'Each provider is run once per prompt version, on free tiers. Latency depends on the provider’s load that day, and a busy provider shows up as failed calls.',
      'The honesty check is a simple text match: it can miss an invented fact written with common words and can flag harmless names.',
      'The synthetic cases are written in clear English. Real posts are messier, so real-world accuracy is likely lower until the real cases are in.',
    ],
  },
  footer: {
    navAriaLabel: 'Footer',
    builtWith: 'Built with Claude Code',
    /** Footer links. GitHub shows only once SOURCE_URL (packages/core/brand.ts) is set: the repo is private for now. */
    links: [
      { label: 'Evals', href: '/evals' },
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
