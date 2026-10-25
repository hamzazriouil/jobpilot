import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_AFTER_LOGIN, hasAuthCookie, isAppPath, LOGIN_PATH } from '@/lib/auth/paths';
import { getRequestContext } from '@/lib/server/env';
import { supabasePublicConfig } from '@/lib/supabase/config';

// Session refresh + route guard (docs/09-PHASE1-CONTRACT.md §2).
// middleware.ts on the edge runtime, not Next 16's proxy.ts: OpenNext on Cloudflare doesn't run
// Node middleware / proxy.ts yet.
//
// - No Supabase cookie: no network call. App routes redirect to /login?next=…, everything else passes.
// - Supabase cookie: getClaims() verifies the JWT and refreshes an expired session; the new cookies
//   are written to both the request (for this render) and the response (for the browser).

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedInCookie = hasAuthCookie(request.cookies.getAll().map((c) => c.name));

  if (!signedInCookie) {
    return isAppPath(pathname) ? redirectToLogin(request) : NextResponse.next();
  }

  const { env } = await getRequestContext();
  const config = supabasePublicConfig(env);
  if (!config) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = typeof data?.claims?.sub === 'string';
  } catch (err) {
    console.error(JSON.stringify({ type: 'middleware_auth_failed', message: String(err) }));
  }

  if (!signedIn && isAppPath(pathname)) return withCookies(redirectToLogin(request), response);
  if (signedIn && pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_AFTER_LOGIN;
    url.search = '';
    return withCookies(NextResponse.redirect(url), response);
  }
  return response;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = '';
  url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

/** Carries refreshed (or cleared) auth cookies over to a redirect response. */
function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

export const config = {
  // Pages only: route handlers under /api check auth themselves; static files never need it.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|og-image.png|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)'],
};
