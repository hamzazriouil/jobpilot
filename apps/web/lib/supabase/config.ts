import type { AppEnv } from '@/lib/server/env';

// Supabase URL + anon key from the Worker env, read at request time (they are Worker secrets), never
// from process.env.NEXT_PUBLIC_*, which Next would inline at build time where they aren't set.
// No next/headers import, so the edge middleware can use it too.

export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export function supabasePublicConfig(env: AppEnv): SupabasePublicConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}
