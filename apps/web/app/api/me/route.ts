import { getRequestContext } from '@/lib/server/env';
import { logError } from '@/lib/server/http';
import { utcDay } from '@/lib/server/ip';
import { PAID_ANALYZE_DAILY_LIMIT, USER_ANALYZE_DAILY_LIMIT, userSubject } from '@/lib/server/quota';
import { supabaseAdmin } from '@/lib/server/supabase';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// GET /api/me (docs/05-ARCHITECTURE.md §8): who is signed in, their plan and today's usage.
// Plan and profile are read as the user (RLS); usage_counters is server-only, so it goes through
// the service role, filtered to this user's subject.

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const supabase = await createSupabaseServer();
  const [planRes, profileRes] = await Promise.all([
    supabase.rpc('current_plan', { p_user: user.id }),
    supabase.from('profiles').select('onboarded_at').eq('id', user.id).maybeSingle(),
  ]);
  if (planRes.error) logError('me_plan_failed', planRes.error);
  if (profileRes.error) logError('me_profile_failed', profileRes.error);

  const planRow = (planRes.data as Array<{ plan: string; ends_at: string | null }> | null)?.[0];
  const plan = planRow?.plan ?? 'free';

  let analyzeUsed = 0;
  const { env } = await getRequestContext();
  const db = supabaseAdmin(env);
  if (db) {
    try {
      const rows = await db.select<{ count: number }>(
        'usage_counters',
        `select=count&subject=eq.${encodeURIComponent(userSubject(user.id))}&feature=eq.analyze&day=eq.${utcDay()}`,
      );
      analyzeUsed = rows[0]?.count ?? 0;
    } catch (err) {
      logError('me_usage_failed', err);
    }
  }

  return Response.json(
    {
      user: { id: user.id, email: user.email },
      plan,
      planEndsAt: planRow?.ends_at ?? null,
      onboarded: Boolean(profileRes.data?.onboarded_at),
      usageToday: {
        analyze: analyzeUsed,
        analyzeLimit: plan === 'free' ? USER_ANALYZE_DAILY_LIMIT : PAID_ANALYZE_DAILY_LIMIT,
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
