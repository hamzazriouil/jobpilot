import { apiErrorResponse, INTERNAL_MESSAGE, logError } from '@/lib/server/http';
import { loadStatsInputs } from '@/lib/server/tracker';
import { computeStats } from '@/lib/stats';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// GET /api/stats (docs/05-ARCHITECTURE.md §8, W17): the funnel aggregates /stats renders, as JSON.

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { apps, events } = await loadStatsInputs(await createSupabaseServer(), auth.user.id);
    return Response.json({ stats: computeStats(apps, events) }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    logError('stats_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
}
