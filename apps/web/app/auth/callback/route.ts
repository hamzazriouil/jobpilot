import { NextResponse } from 'next/server';
import { ONBOARDING_PATH, safeNext } from '@/lib/auth/paths';
import { logError } from '@/lib/server/http';
import { createSupabaseServer } from '@/lib/supabase/server';

// GET /auth/callback?code=…&next=… (Google and magic link, PKCE). Exchanges the code for a session
// cookie, then sends users who haven't finished onboarding to /onboarding, everyone else to `next`.

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin).toString(), 303);

  const code = url.searchParams.get('code');
  if (!code) {
    // Supabase sends ?error=…&error_description=… when the provider or the link failed.
    return to(url.searchParams.get('error') ? '/login?error=oauth' : '/login?error=link');
  }

  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) {
      logError('auth_callback_exchange_failed', error ?? new Error('no user'), { status: error?.status });
      return to('/login?error=link');
    }

    const { data: profile } = await supabase.from('profiles').select('onboarded_at').eq('id', data.user.id).maybeSingle();
    const next = safeNext(url.searchParams.get('next'));
    return to(profile?.onboarded_at ? next : ONBOARDING_PATH);
  } catch (err) {
    logError('auth_callback_failed', err);
    return to('/login?error=config');
  }
}
