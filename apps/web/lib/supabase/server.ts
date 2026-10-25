import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { apiErrorResponse } from '@/lib/server/http';
import { getRequestContext } from '@/lib/server/env';
import { supabasePublicConfig } from './config';

// Cookie-bound Supabase client for server components and route handlers (docs/09-PHASE1-CONTRACT.md §2).
// It uses the anon key, so every query runs **as the signed-in user under RLS**. Service-role writes
// go through supabaseAdmin() in lib/server/supabase.ts instead.

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set');
    this.name = 'SupabaseNotConfiguredError';
  }
}

export async function createSupabaseServer(): Promise<SupabaseClient> {
  const { env } = await getRequestContext();
  const config = supabasePublicConfig(env);
  if (!config) throw new SupabaseNotConfiguredError();
  const store = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components can't set cookies. middleware.ts refreshes the session before render.
        }
      },
    },
  });
}

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * The verified signed-in user, or null. `getClaims()` checks the JWT signature (locally with the
 * project's JWKS, or against the Auth server for symmetric keys). Cached for the request.
 */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    const sub = claims?.sub;
    if (error || !claims || typeof sub !== 'string') return null;
    const email = claims.email;
    return { id: sub, email: typeof email === 'string' ? email : null };
  } catch (err) {
    if (!(err instanceof SupabaseNotConfiguredError)) {
      console.error(JSON.stringify({ type: 'auth_get_user_failed', message: String(err) }));
    }
    return null;
  }
});

/** For route handlers: the user, or a ready-made 401 in the shared error shape. */
export async function requireUser(): Promise<{ ok: true; user: SessionUser } | { ok: false; response: Response }> {
  const user = await getUser();
  if (user) return { ok: true, user };
  return { ok: false, response: apiErrorResponse('unauthorized', 'Please sign in to continue.', 401) };
}
