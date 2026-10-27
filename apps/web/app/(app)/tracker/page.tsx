import { redirect } from 'next/navigation';
import { TrackerBoard } from '@/components/tracker/tracker-board';
import { LOGIN_PATH } from '@/lib/auth/paths';
import { logError } from '@/lib/server/http';
import { utcDay } from '@/lib/server/matching';
import { loadTrackerItems } from '@/lib/server/tracker';
import { strings } from '@/lib/strings';
import { createSupabaseServer, getUser } from '@/lib/supabase/server';
import type { TrackerItem } from '@/lib/tracker';

// /tracker (docs/03-UI-UX.md §4.8, W16): the user's applications, read under RLS, rendered by the
// client board.

export const metadata = { title: strings.tracker.title };

export default async function TrackerPage() {
  const user = await getUser();
  if (!user) redirect(LOGIN_PATH);
  let items: TrackerItem[] = [];
  let failed = false;
  try {
    items = await loadTrackerItems(await createSupabaseServer(), user.id);
  } catch (err) {
    logError('tracker_load_failed', err);
    failed = true;
  }
  if (failed) {
    return (
      <p role="alert" className="text-sm text-miss">
        {strings.tracker.loadFailed}
      </p>
    );
  }
  return <TrackerBoard items={items} today={utcDay(new Date())} />;
}
