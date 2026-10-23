/**
 * All English UI copy lives here (docs/05-ARCHITECTURE.md §3).
 * Components must not hard-code user-facing text. Adding French later means
 * adding a second object with the same shape.
 *
 * The brand name and tagline come from packages/core/brand.ts, never from here.
 */
import { BRAND_NAME, BRAND_TAGLINE } from '@jobpilot/core/brand';

export const strings = {
  meta: {
    title: `${BRAND_NAME}: ${BRAND_TAGLINE}`,
    description:
      'Paste your CV and a remote job post. Find out if you can apply from your country, get an honest fit score, and a ready-to-send cover letter and cold DM.',
  },
  header: {
    brand: BRAND_NAME,
    homeAriaLabel: `${BRAND_NAME} home`,
    comingSoonBadge: 'Coming soon',
  },
  hero: {
    title: BRAND_TAGLINE,
    subtitle:
      'Paste your CV and a job post. In 30 seconds: whether you can apply from your country, an honest fit score, and a ready-to-send cover letter and cold DM.',
    trustLine: 'No signup · CV never stored',
  },
  analyzer: {
    sectionAriaLabel: 'Job fit analyzer (coming soon)',
    cvLabel: 'Your CV',
    cvPlaceholder: 'Paste the text of your CV…',
    jobLabel: 'Job post',
    jobPlaceholder: 'Paste the full job post…',
    submit: 'Analyze',
    comingSoonNote: 'The analyzer is being built right now. It goes live in the next release.',
  },
  footer: {
    builtWith: 'Built with Claude Code',
    sourceLink: 'GitHub',
    sourceHref: 'https://github.com/', // TODO: set to the public repo URL once it exists
    copyright: (year: number) => `© ${year} ${BRAND_NAME}`,
  },
} as const;

export type Strings = typeof strings;
