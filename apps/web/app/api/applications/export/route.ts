import { toCsv } from '@/lib/csv';
import { apiErrorResponse, INTERNAL_MESSAGE, logError } from '@/lib/server/http';
import { loadTrackerItems } from '@/lib/server/tracker';
import { utcDay } from '@/lib/server/matching';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// GET /api/applications/export (PRD F1.10, W17): the user's pipeline as a CSV download, read under
// RLS. Opened from /settings with a plain link, so the browser handles the download.

export const dynamic = 'force-dynamic';

const HEADER = ['Title', 'Company', 'Stage', 'Channel', 'Fit band', 'Fit score', 'Applied at', 'Follow-up due', 'Last contact', 'Notes', 'Job URL', 'Tracked at'];

export async function GET(): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const supabase = await createSupabaseServer();
    const items = await loadTrackerItems(supabase, auth.user.id);
    const csv = toCsv(
      HEADER,
      items.map((it) => [
        it.title,
        it.company,
        it.stage,
        it.channel,
        it.analysis?.band ?? null,
        it.analysis?.score ?? null,
        it.appliedAt,
        it.followUpDueAt,
        it.lastContactAt,
        it.notes,
        it.url,
        it.createdAt,
      ]),
    );
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="applications-${utcDay(new Date())}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    logError('applications_export_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
}
