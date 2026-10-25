import { NextResponse } from 'next/server';
import { safeNext } from '@/lib/auth/paths';
import { logError } from '@/lib/server/http';
import { createSupabaseServer } from '@/lib/supabase/server';

// GET /auth/google?next=… → Google OAuth through Supabase (PKCE). The code verifier is stored in a
// cookie here and used by /auth/callback, so the flow must start and end in the same browser.

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const callback = new URL('/auth/callback', url.origin);
  callback.searchParams.set('next', next);

  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) throw error ?? new Error('no OAuth URL returned');
    return NextResponse.redirect(data.url, 303);
  } catch (err) {
    logError('auth_google_start_failed', err);
    return NextResponse.redirect(new URL('/login?error=oauth', url.origin).toString(), 303);
  }
}
