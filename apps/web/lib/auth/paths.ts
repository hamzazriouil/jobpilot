// Route rules shared by middleware.ts and the auth route handlers (docs/09-PHASE1-CONTRACT.md §2).
// Pure functions: no Next or Supabase imports, so they run in the edge middleware and in tests.

/** Pages that need a signed-in user. Signed-out visitors are sent to /login?next=<path>. */
export const APP_PATH_PREFIXES = ['/onboarding', '/feed', '/jobs', '/tracker', '/stats', '/settings'] as const;

export const LOGIN_PATH = '/login';
export const ONBOARDING_PATH = '/onboarding';
/** Where a signed-in, onboarded user lands by default (docs/03-UI-UX.md §3). */
export const DEFAULT_AFTER_LOGIN = '/feed';

export function isAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const BASE = 'http://applyverdict.invalid';

/**
 * Sanitizes a `next` redirect target: same-site relative paths only (no `//host`, no `\`, no scheme),
 * and never back into the auth flow. Anything else returns `fallback`.
 */
export function safeNext(raw: string | null | undefined, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (!raw || raw.length > 512) return fallback;
  // eslint-disable-next-line no-control-regex
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (url.pathname === LOGIN_PATH || url.pathname.startsWith('/auth/')) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** True when the request carries a Supabase auth cookie (`sb-<ref>-auth-token`, possibly chunked `.0`, `.1`). */
export function hasAuthCookie(names: Iterable<string>): boolean {
  for (const name of names) {
    if (name.startsWith('sb-') && name.includes('-auth-token')) return true;
  }
  return false;
}
