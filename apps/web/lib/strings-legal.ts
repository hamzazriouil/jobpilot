/**
 * Copy for /pricing, /privacy, /terms and /refund. Same rules as lib/strings.ts: all user-facing
 * text lives in strings files, the brand and contact email come from packages/core/brand.ts.
 *
 * Every fact here must match what the system actually does (docs/05-ARCHITECTURE.md §4, §9, §11,
 * §12; docs/02-DATABASE.md §1, §7). If you change routing, retention, providers or limits, change
 * this file and bump LEGAL_LAST_UPDATED in brand.ts.
 *
 * Not legal advice: these pages are a plain-English first version written for a solo founder.
 * Items marked TODO(founder) need the founder's decision before paid plans go live.
 */
import {
  BRAND_NAME,
  LEGAL_COUNTRY,
  LEGAL_LAST_UPDATED,
  LEGAL_OPERATOR,
  SUPPORT_EMAIL,
} from '@jobpilot/core/brand';

/** A link inside a paragraph. Internal paths start with `/`; `mailto:` links open the mail app. */
export interface LegalLink {
  text: string;
  href: string;
}
/** A paragraph or list item: plain text, or text mixed with links. */
export type LegalText = string | ReadonlyArray<string | LegalLink>;

export interface LegalSection {
  /** Anchor id, e.g. /privacy#ai-providers. */
  id: string;
  title: string;
  paragraphs?: ReadonlyArray<LegalText>;
  list?: ReadonlyArray<LegalText>;
  /** Paragraphs shown after the list. */
  after?: ReadonlyArray<LegalText>;
}

export interface LegalDoc {
  /** Page <title> (without the brand) and the visible H1. */
  title: string;
  /** Meta description. */
  description: string;
  /** Short plain-English summary shown above the sections. */
  summary: ReadonlyArray<LegalText>;
  sections: ReadonlyArray<LegalSection>;
}

// ── Shared facts ─────────────────────────────────────────────────────────────

const mail: LegalLink = { text: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` };
const privacyLink: LegalLink = { text: 'Privacy Policy', href: '/privacy' };
const termsLink: LegalLink = { text: 'Terms of Service', href: '/terms' };
const refundLink: LegalLink = { text: 'Refund Policy', href: '/refund' };
const pricingLink: LegalLink = { text: 'Pricing', href: '/pricing' };

/** Daily analysis limits (docs/05-ARCHITECTURE.md §9). Keep in sync with the server quotas. */
export const LIMITS = { anonymous: 3, freeAccount: 5, sprint: 30 } as const;

/** One-time Sprint Passes (docs/01-PRD.md §9.2). Prices in USD. */
export const PLANS = {
  sprint30: { name: 'Sprint 30', price: 7, days: 30 },
  sprint90: { name: 'Sprint 90', price: 15, days: 90 },
} as const;

/**
 * Refund terms.
 * TODO(founder): PROPOSAL, not yet confirmed. Confirm the window and the analysis cap before
 * checkout goes live (and check they fit Dodo Payments' own refund rules).
 */
export const REFUND = { windowDays: 7, maxAnalyses: 20 } as const;

/** Minimum age to use the service. TODO(founder): confirm (16 matches the GDPR default). */
export const MIN_AGE = 16;

/** How long technical records are kept (docs/02-DATABASE.md §7, run_maintenance). */
const RETENTION = { usageCounterDays: 7, llmCallDays: 90 } as const;

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// ── Page chrome shared by the legal pages ────────────────────────────────────

export const legalChrome = {
  lastUpdatedIso: LEGAL_LAST_UPDATED,
  lastUpdated: `Last updated: ${formatDate(LEGAL_LAST_UPDATED)}`,
  onThisPage: 'On this page',
  summaryTitle: 'The short version',
  contactTitle: 'Questions?',
  contactBody: ['Email ', mail, ". A real person reads every message, and we aim to reply within 3 business days."] as LegalText,
  /** Page <title>: "Privacy Policy · Brand". */
  pageTitle: (title: string) => `${title} · ${BRAND_NAME}`,
};

// ── Privacy ──────────────────────────────────────────────────────────────────

export const privacy: LegalDoc = {
  title: 'Privacy Policy',
  description: `What ${BRAND_NAME} collects, which AI providers see your CV, how long anything is kept, and how to delete it.`,
  summary: [
    "Without an account, we don't save your CV or the job post on our servers. We send them to an AI provider to produce your analysis, and that's it.",
    "Outside the EEA, UK and Switzerland, that provider is usually Google's free Gemini API. On that free tier, Google may use what you send to improve its products, and people at Google may read it. Remove anything you don't want to share (like your phone number or home address) before you paste your CV.",
    'To enforce the free daily limit, we keep a scrambled version of your IP address that changes every day. We never store your raw IP address.',
    "We don't sell your data, we don't show ads, and we don't use ad trackers.",
  ],
  sections: [
    {
      id: 'who-we-are',
      title: 'Who we are',
      paragraphs: [
        `${BRAND_NAME} is run by ${LEGAL_OPERATOR}. For anything about your data, email us.`,
        ['Contact: ', mail],
      ],
    },
    {
      id: 'without-account',
      title: 'When you use the analyzer without an account',
      paragraphs: ['When you click Analyze, your browser sends us:'],
      list: [
        'the CV text you pasted',
        'the job post you pasted',
        'the country you picked (used only to check whether you can apply, never to choose an AI provider)',
      ],
      after: [
        "Our server passes this text to one AI provider (see below) to produce the analysis, then sends it back again when you ask for drafts. We don't write your CV, the job post or the results to our database. Your results live in your browser tab and are gone when you close it.",
      ],
    },
    {
      id: 'what-we-store',
      title: 'What we do store',
      list: [
        `A scrambled IP address, to count your free analyses. We combine your IP address with a secret value and the date, then hash it. The result changes every day, so it can't be linked across days, and it can't be turned back into your IP address. These counters are deleted after about ${RETENTION.usageCounterDays} days.`,
        `A technical record of each AI call: which feature ran, which provider and model answered, the prompt version, the number of tokens, how long it took, the estimated cost, whether the answer was valid, and any error code. It contains no CV text and no job text. These records are deleted after ${RETENTION.llmCallDays} days.`,
        'Hosting logs. Cloudflare, our host, processes your IP address and request details to deliver the site and block attacks. Error logs from our app are kept by Cloudflare for a short time to help us fix problems.',
      ],
    },
    {
      id: 'on-your-device',
      title: 'What stays on your device',
      paragraphs: [
        'If you tick "Remember my CV on this device", your CV is saved in your browser\'s local storage, on your device only. We also save the country you picked and your light or dark theme choice there. Untick the box, or clear your browser data, to delete them. Nothing in local storage is sent to us unless you run an analysis.',
        "We don't set cookies today. Cloudflare may set a strictly necessary security cookie to tell people from bots. When accounts launch, we'll use a login cookie to keep you signed in.",
      ],
    },
    {
      id: 'ai-providers',
      title: 'Which AI providers see your text',
      paragraphs: [
        "We pick the provider from the country Cloudflare detects from your internet connection. The country you choose in the form doesn't change this. If we can't tell where you are, we treat you as being in the EEA, UK or Switzerland.",
      ],
      list: [
        "Google Gemini API, free tier: the main provider for visitors outside the EEA, UK and Switzerland. Because this is Google's unpaid tier, Google may use the text you submit to improve its products, and human reviewers may read it. This is exactly why we never send text from the EEA, UK or Switzerland to it.",
        "Cloudflare Workers AI: used for visitors in the EEA, UK and Switzerland, and as a backup when Gemini is busy. Cloudflare says it doesn't use customer content to train its models.",
        "Anthropic Claude (coming with paid plans): for paid users. Anthropic doesn't train its models on data sent through its paid API by default.",
      ],
      after: [
        "We don't train any AI models on your data ourselves.",
      ],
    },
    {
      id: 'accounts',
      title: 'Accounts (coming soon)',
      paragraphs: [
        "Accounts aren't available yet. When they launch, we'll store your data with Supabase, in its EU region:",
      ],
      list: [
        'your email address, and your name if you sign in with Google',
        'your profile: CV text, the profile we build from it, country, target roles and preferences',
        'jobs you save, your analyses and drafts, your applications and notes, and any feedback you send',
      ],
      after: [
        'We keep this until you delete your account. You will be able to delete your account and all of this data from your settings, or by emailing us.',
      ],
    },
    {
      id: 'payments',
      title: 'Payments (coming soon)',
      paragraphs: [
        "Payments are processed by Dodo Payments, our Merchant of Record. Dodo collects your card or payment details and your billing address; we never see your card number. Dodo tells us the payment ID, the plan, the amount, the currency and the payment status, so we can turn your pass on. We keep these payment records for as long as tax and accounting rules require, even if you delete your account (they are then no longer linked to it).",
      ],
    },
    {
      id: 'service-providers',
      title: 'Other companies that help us run the service',
      list: [
        'Cloudflare: hosting, security and Workers AI.',
        'Google: the Gemini API (see above).',
        'Supabase (EU region): our database for usage counters and AI call records, and later for accounts.',
        'Resend (later): sending emails, such as login links and the optional daily digest.',
        'Dodo Payments (later): checkout, tax and receipts.',
        'Anthropic (later): the AI model for paid users.',
      ],
      after: [
        "Some of these companies process data outside your country, including in the United States. We rely on their standard safeguards for international transfers, such as the EU's Standard Contractual Clauses.",
      ],
    },
    {
      id: 'why',
      title: 'Why we use your data',
      list: [
        'To give you the analysis and drafts you asked for.',
        'To enforce the free daily limits and stop abuse (our legitimate interest in keeping a free service running).',
        'To watch costs, errors and quality, using the technical records above (our legitimate interest).',
        'Later, to run your account, process payments and keep the records the law requires.',
      ],
    },
    {
      id: 'what-we-dont-do',
      title: "What we don't do",
      list: [
        "We don't sell or rent your data.",
        "We don't show ads or use advertising trackers.",
        "We don't use analytics cookies.",
        "We don't send applications or messages for you. You decide what to send.",
      ],
    },
    {
      id: 'your-rights',
      title: 'Your rights',
      paragraphs: [
        'You can ask us to:',
      ],
      list: [
        'show you the data we hold about you (access), and give you a copy (portability)',
        'correct it',
        'delete it',
        'stop using it for a purpose you object to (objection), or limit how we use it',
      ],
      after: [
        ['To use any of these rights, email ', mail, '. We reply within 30 days. If you use the service without an account, we usually hold nothing that identifies you, because the scrambled IP changes daily and AI call records contain no text.'],
        "If you're unhappy with our answer, you can complain to a data protection authority: the CNDP in Morocco, or the authority where you live (for example, in the EU or UK).",
      ],
    },
    {
      id: 'children',
      title: 'Age',
      paragraphs: [
        `${BRAND_NAME} is not for anyone under ${MIN_AGE}. If you think someone under ${MIN_AGE} has sent us personal data, email us and we'll delete it.`,
      ],
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      paragraphs: [
        "When we change this policy, we'll update the date at the top. If a change matters, we'll say so on the site, and once accounts exist, we'll email account holders.",
        ['See also our ', termsLink, ' and ', refundLink, '.'],
      ],
    },
  ],
};

// ── Terms ────────────────────────────────────────────────────────────────────

export const terms: LegalDoc = {
  title: 'Terms of Service',
  description: `The rules for using ${BRAND_NAME}: what the AI can and can't do, acceptable use, payments through Dodo Payments, and governing law.`,
  summary: [
    "The AI can be wrong. It isn't career, legal or immigration advice. Check anything important yourself, and review every draft before you send it.",
    "You're responsible for what you paste. Only paste your own CV, or someone else's with their permission.",
    "Don't abuse the service: no scraping, no bots, no getting around the limits.",
    'Paid plans are one-time payments, not subscriptions. Payments are processed by Dodo Payments, our Merchant of Record.',
  ],
  sections: [
    {
      id: 'agreement',
      title: 'Who we are and this agreement',
      paragraphs: [
        `${BRAND_NAME} is run by ${LEGAL_OPERATOR} ("we", "us"). By using ${BRAND_NAME}, you agree to these terms and to our privacy practices described in the Privacy Policy. If you don't agree, please don't use the service.`,
        ['Read the ', privacyLink, ' to see what happens to your data.'],
      ],
    },
    {
      id: 'service',
      title: 'What the service does',
      paragraphs: [
        `${BRAND_NAME} reads a CV and a job post, checks whether the job seems open to people in your country, scores how well the CV fits, and writes drafts such as a cover letter and a cold message. It uses third-party AI models to do this.`,
        'Some features, such as accounts and paid plans, are not available yet. We describe them as "coming soon" until they are.',
      ],
    },
    {
      id: 'ai-output',
      title: 'AI output can be wrong',
      list: [
        'Results are produced by AI models and can be incomplete, out of date or simply wrong, even though we check the quotes they rely on.',
        "Nothing on the site is career, legal, immigration, tax or financial advice. Our eligibility check only reads the job post; it can't tell you whether you're legally allowed to work somewhere. Confirm with the employer.",
        'A fit score is an estimate, not a prediction of whether you will get the job.',
        "Drafts are suggestions. Read them before you send them and fix anything that isn't true. You're responsible for what you submit.",
      ],
    },
    {
      id: 'your-content',
      title: 'Your content',
      list: [
        'You keep all rights to the CVs, job posts and notes you add.',
        'You let us process that content only to run the service for you, which includes sending it to the AI providers described in our Privacy Policy.',
        "You're responsible for what you paste. Don't paste someone else's CV or personal details unless they've agreed.",
        "Don't paste anything you're not allowed to share, such as confidential documents from an employer.",
      ],
    },
    {
      id: 'acceptable-use',
      title: 'Acceptable use',
      paragraphs: ["Please don't:"],
      list: [
        'scrape the site, use bots, or send automated or bulk requests',
        'try to get around the daily limits, for example by rotating IP addresses or creating many accounts',
        'attack, overload or probe the service, or try to break its security',
        'try to make the AI produce harmful content or ignore its instructions',
        'use the drafts to invent experience or deceive employers',
        'resell or share paid access',
        'use the service for anything illegal',
      ],
      after: [
        'We may block requests, limit use or close accounts that break these rules.',
      ],
    },
    {
      id: 'age',
      title: 'Age',
      paragraphs: [`You must be at least ${MIN_AGE} years old to use ${BRAND_NAME}.`],
    },
    {
      id: 'accounts',
      title: 'Accounts (coming soon)',
      paragraphs: [
        "When accounts launch, keep your login secure and don't share your account. You can delete your account at any time.",
      ],
    },
    {
      id: 'payments',
      title: 'Paid plans and payments',
      list: [
        ['Paid plans are listed on our ', pricingLink, ' page. They are not on sale yet.'],
        'Each Sprint Pass is a one-time payment, not a subscription. It never renews automatically and you will never be charged again unless you buy another pass.',
        'A pass starts when your payment is confirmed and lasts the number of days shown (30 or 90). If you buy a pass while one is active, the new one starts when the current one ends.',
        'Payments are processed by Dodo Payments, our Merchant of Record. Dodo is the seller of record for your purchase, handles checkout, taxes and receipts, and its own buyer terms also apply.',
        'Prices are in US dollars. Sales tax or VAT may be added at checkout depending on where you live.',
        ['Refunds follow our ', refundLink, '.'],
      ],
    },
    {
      id: 'availability',
      title: 'Availability and changes',
      paragraphs: [
        'The free tier depends on free AI quotas, so it may be slow or unavailable at busy times. We may change, pause or stop features. If we stop a paid feature while your pass is active, we will refund the unused part of your pass.',
      ],
    },
    {
      id: 'liability',
      title: 'Disclaimer and limits of liability',
      paragraphs: [
        'The service is provided "as is", without warranties, to the extent the law allows.',
        'To the extent the law allows, we are not liable for indirect losses, such as a missed job opportunity, and our total liability to you is limited to the amount you paid us in the 12 months before the claim.',
        "Nothing in these terms limits rights you have under consumer law where you live, or liability that can't be limited by law.",
      ],
    },
    {
      id: 'law',
      title: 'Governing law',
      paragraphs: [
        `These terms are governed by the laws of ${LEGAL_COUNTRY}, and disputes go to the courts of ${LEGAL_COUNTRY}. If you are a consumer, you keep the protection of the mandatory laws of the country where you live, and you may be able to bring a claim there.`,
      ],
    },
    {
      id: 'changes',
      title: 'Changes to these terms',
      paragraphs: [
        "We may update these terms. We'll change the date at the top, and for important changes, we'll tell you on the site or by email. If you keep using the service after a change, the new terms apply.",
      ],
    },
  ],
};

// ── Refund ───────────────────────────────────────────────────────────────────

// TODO(founder): PROPOSAL. The whole refund policy below is a suggested default. Confirm the
// window (REFUND.windowDays), the cap (REFUND.maxAnalyses) and the reply time before launch.
export const refund: LegalDoc = {
  title: 'Refund Policy',
  description: `How refunds work for ${BRAND_NAME} Sprint Passes: a full refund within ${REFUND.windowDays} days if you've used fewer than ${REFUND.maxAnalyses} analyses.`,
  summary: [
    `Changed your mind? Ask within ${REFUND.windowDays} days of buying a Sprint Pass. If you've run fewer than ${REFUND.maxAnalyses} analyses with it, you get a full refund.`,
    'Refunds are processed by Dodo Payments, our Merchant of Record, back to the way you paid.',
    'Paid plans are not on sale yet. This policy will apply from the day they launch.',
  ],
  sections: [
    {
      id: 'full-refund',
      title: 'When you get a full refund',
      list: [
        `You ask within ${REFUND.windowDays} days of your purchase, and you've run fewer than ${REFUND.maxAnalyses} analyses since you bought the pass.`,
        'You were charged twice, or charged by mistake.',
        "A problem on our side stopped you from using the pass, and we couldn't fix it.",
      ],
    },
    {
      id: 'other-cases',
      title: 'Other cases',
      paragraphs: [
        "Outside these cases, we don't usually refund a pass you've used. If something feels unfair, write to us anyway. We read every request and may offer a partial refund.",
        'The free plan costs nothing, so there is nothing to refund.',
      ],
    },
    {
      id: 'how-to-ask',
      title: 'How to ask for a refund',
      paragraphs: [
        ['Email ', mail, ' with:'],
      ],
      list: [
        'the email address you used at checkout',
        'your order or payment ID from the Dodo Payments receipt, if you have it',
      ],
      after: [
        'We aim to reply within 3 business days.',
      ],
    },
    {
      id: 'how-paid',
      title: 'How you get your money back',
      paragraphs: [
        'Refunds are processed by Dodo Payments, our Merchant of Record, back to the original payment method. How long the money takes to reach you depends on your bank or card provider, often 5 to 10 business days.',
      ],
    },
    {
      id: 'pass-ends',
      title: 'What happens to your pass',
      paragraphs: [
        'When a refund is issued, the pass ends right away and you go back to the free plan. Your account and saved data stay.',
        'If you open a chargeback or payment dispute, the pass also ends. Please email us first: it is usually faster.',
      ],
    },
    {
      id: 'your-rights',
      title: 'Your legal rights',
      paragraphs: [
        "Dodo Payments is the seller of record for your purchase, so its buyer terms also apply. Depending on where you live, you may have extra rights by law, such as a right to cancel an online purchase. This policy doesn't limit them.",
        ['See also our ', termsLink, '.'],
      ],
    },
  ],
};

// ── Pricing ──────────────────────────────────────────────────────────────────

export interface PricingPlan {
  id: 'free' | 'sprint30' | 'sprint90';
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: ReadonlyArray<string>;
  /** Features that only arrive with accounts (shown under a "coming soon" label). */
  laterFeatures?: ReadonlyArray<string>;
  available: boolean;
  cta: string;
}

const usd = (n: number) => `$${n}`;

export const pricing = {
  title: 'Pricing',
  description: `${BRAND_NAME} is free to try: ${LIMITS.anonymous} analyses a day, no account. Sprint Passes are one-time payments: ${usd(PLANS.sprint30.price)} for ${PLANS.sprint30.days} days or ${usd(PLANS.sprint90.price)} for ${PLANS.sprint90.days} days. No subscription.`,
  heading: 'Simple pricing for a job hunt',
  intro:
    "Job hunts end, so we don't do subscriptions. Try it free, and if you need more, buy a pass for 30 or 90 days. It never renews.",
  comingSoon: 'Coming soon',
  availableNow: 'Available now',
  laterLabel: 'With a free account (coming soon):',
  freeCtaHref: '/',
  plans: [
    {
      id: 'free',
      name: 'Free',
      price: usd(0),
      cadence: 'forever',
      blurb: 'Try it now. No account, no card.',
      features: [
        `${LIMITS.anonymous} full analyses a day, no account needed`,
        'Eligibility check for your country',
        'Fit score with evidence from your CV',
        'Top gaps and how to close them, plus red flags',
        'Cover letter and cold DM drafts',
        'Rewritten CV bullets for the job',
      ],
      laterFeatures: [
        `${LIMITS.freeAccount} analyses a day`,
        'Top 5 matched jobs every day',
        'Application tracker for up to 25 applications',
      ],
      available: true,
      cta: 'Analyze a job',
    },
    {
      id: 'sprint30',
      name: PLANS.sprint30.name,
      price: usd(PLANS.sprint30.price),
      cadence: `one-time · ${PLANS.sprint30.days} days`,
      blurb: 'For an active month of applying.',
      features: [
        `${LIMITS.sprint} analyses a day`,
        'Top 30 matched jobs every day',
        'Unlimited application tracker',
        'Follow-up message drafts',
        'Interview prep',
        "A stronger AI model (Anthropic Claude) that doesn't train on your data",
      ],
      available: false,
      cta: 'Coming soon',
    },
    {
      id: 'sprint90',
      name: PLANS.sprint90.name,
      price: usd(PLANS.sprint90.price),
      cadence: `one-time · ${PLANS.sprint90.days} days`,
      blurb: 'For a longer search.',
      features: [
        `Everything in ${PLANS.sprint30.name}, for ${PLANS.sprint90.days} days`,
        'Company research briefs before you apply',
      ],
      available: false,
      cta: 'Coming soon',
    },
  ] as ReadonlyArray<PricingPlan>,
  notesTitle: 'Good to know',
  notes: [
    'Sprint Passes are one-time payments, not subscriptions. No automatic renewal, ever.',
    "Paid plans aren't on sale yet. When they launch, this page will say which features are live.",
    'Payments are processed by Dodo Payments, our Merchant of Record. Prices are in US dollars; sales tax or VAT may be added at checkout depending on where you live.',
    ['Changed your mind? See our ', refundLink, '.'],
    ['Questions? Email ', mail, '.'],
  ] as ReadonlyArray<LegalText>,
};
