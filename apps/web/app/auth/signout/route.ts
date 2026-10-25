import { NextResponse } from 'next/server';
import { logError } from '@/lib/server/http';
import { createSupabaseServer } from '@/lib/supabase/server';

// POST /auth/signout (a plain form post from the app header). Clears the session cookies, then home.
// POST only, and same-origin only, so another site can't sign the user out.

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin;
  const from = request.headers.get('origin');
  if (from && from !== origin) return new Response(null, { status: 403 });
  try {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut();
  } catch (err) {
    logError('auth_signout_failed', err);
  }
  return NextResponse.redirect(new URL('/', origin).toString(), 303);
}
