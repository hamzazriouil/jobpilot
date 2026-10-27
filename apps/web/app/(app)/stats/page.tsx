import { redirect } from 'next/navigation';
import { StatsView } from '@/components/stats/stats-view';
import { LOGIN_PATH } from '@/lib/auth/paths';
import { logError } from '@/lib/server/http';
import { loadStatsInputs } from '@/lib/server/tracker';
import { computeStats, type Stats } from '@/lib/stats';
import { strings } from '@/lib/strings';
import { createSupabaseServer, getUser } from '@/lib/supabase/server';

// /stats (docs/03-UI-UX.md §4.9, W17): KPIs, the funnel, reply rates by fit band and by channel,
// and one insight line, all computed in code from the tracker (lib/stats.ts). Below
// STATS_MIN_APPLICATIONS sent, only the counts and a "keep going" note show.

export const metadata = { title: strings.stats.title };

export default async function StatsPage() {
  const user = await getUser();
  if (!user) redirect(LOGIN_PATH);
  let stats: Stats | null = null;
  try {
    const { apps, events } = await loadStatsInputs(await createSupabaseServer(), user.id);
    stats = computeStats(apps, events);
  } catch (err) {
    logError('stats_load_failed', err);
  }
  return <StatsView stats={stats} />;
}
