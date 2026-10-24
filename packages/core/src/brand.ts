// Public brand is not chosen yet (domain decided at purchase time). Change it here only.
export const BRAND_NAME = 'JobPilot';
export const BRAND_TAGLINE = 'Can you actually get this remote job?';
export const SUPPORT_EMAIL = 'hello@example.com'; // TODO: set once the domain is bought

/**
 * Public base URL, used for the sitemap, robots.txt, canonical links and Open Graph URLs when
 * `APP_URL` isn't set at build time. Mirrors `vars.APP_URL` in apps/web/wrangler.jsonc.
 * TODO: set to the real domain once it is bought (and check the workers.dev URL, which normally
 * includes the account subdomain: jobpilot-web.<account>.workers.dev).
 */
export const SITE_URL = 'https://jobpilot-web.workers.dev';

/** Public source repository. The repo is private for now, so the footer hides the link while this is null. */
export const SOURCE_URL: string | null = null;

// ── Legal identity (used by /privacy, /terms, /refund) ──
// TODO(founder): replace LEGAL_OPERATOR with your full legal name (Dodo's review may ask for it).
/** Who runs the service. Reads naturally after "is run by". */
export const LEGAL_OPERATOR = 'the founder, an individual based in Morocco';
export const LEGAL_COUNTRY = 'Morocco';
/** ISO date shown as "Last updated" on the legal pages. Bump it whenever their content changes. */
export const LEGAL_LAST_UPDATED = '2026-10-24';
