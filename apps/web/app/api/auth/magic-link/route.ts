import { NextResponse } from 'next/server';
import { z } from 'zod';
import { safeNext } from '@/lib/auth/paths';
import { getRequestContext } from '@/lib/server/env';
import { apiErrorResponse, badInput, describeZodError, INTERNAL_MESSAGE, logError, readJsonBody } from '@/lib/server/http';
import { anonSubject } from '@/lib/server/ip';
import { acquireGate, MAGIC_LINK_DAILY_LIMIT } from '@/lib/server/quota';
import { supabaseAdmin } from '@/lib/server/supabase';
import { createSupabaseServer } from '@/lib/supabase/server';

// POST /api/auth/magic-link { email, next? } → Supabase sends a sign-in link to /auth/callback (PKCE:
// the code verifier cookie is set on this response, so the link works in this browser only).
// Limited per hashed IP so nobody can burn the project's email quota.

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.email().max(254),
  next: z.string().max(512).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const rc = await getRequestContext();
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return badInput(describeZodError(parsed.error));

  const gate = await acquireGate({
    db: supabaseAdmin(rc.env),
    subject: await anonSubject(request.headers, rc.env.IP_HASH_SALT, rc.isProd),
    endpoint: 'magic_link',
    quota: { feature: 'magic_link', limit: MAGIC_LINK_DAILY_LIMIT },
    waitUntil: rc.waitUntil,
  });
  if (gate.outcome === 'locked') return apiErrorResponse('busy', 'Please wait a few seconds before trying again.', 429);
  if (gate.outcome === 'quota_exceeded') {
    return apiErrorResponse('quota_exceeded', 'Too many sign-in emails today. Try Google, or come back tomorrow.', 429);
  }

  try {
    const origin = new URL(request.url).origin;
    const callback = new URL('/auth/callback', origin);
    callback.searchParams.set('next', safeNext(parsed.data.next));

    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
    });
    if (error) {
      logError('magic_link_failed', error, { status: error.status, code: error.code });
      if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
        return apiErrorResponse('busy', 'Too many sign-in emails right now. Try again in a few minutes, or use Google.', 429);
      }
      if (error.code === 'email_address_not_authorized') {
        // Supabase's built-in mailer only delivers to the project team until custom SMTP is set up.
        return apiErrorResponse('bad_input', 'Email sign-in is not open yet. Please continue with Google.', 400);
      }
      if (error.status === 400 || error.status === 422) return badInput('Please check the email address.');
      return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
    }
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    logError('magic_link_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  } finally {
    gate.release();
  }
}
