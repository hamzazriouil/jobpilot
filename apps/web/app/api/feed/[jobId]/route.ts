import { z } from 'zod';
import { apiErrorResponse, badInput, INTERNAL_MESSAGE, logError, readJsonBody } from '@/lib/server/http';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// PATCH /api/feed/:jobId { dismissed } (W15): hides or restores a feed card. RLS lets a user update
// only `dismissed` on their own daily_matches rows, so this runs as the user, not the service role.

export const dynamic = 'force-dynamic';

const Body = z.object({ dismissed: z.boolean() });

export async function PATCH(request: Request, ctx: { params: Promise<{ jobId: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const jobId = z.uuid().safeParse((await ctx.params).jobId);
  if (!jobId.success) return apiErrorResponse('not_found', 'Match not found.', 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return badInput('Expected { dismissed: boolean }.');

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('daily_matches')
    .update({ dismissed: parsed.data.dismissed })
    .eq('user_id', auth.user.id)
    .eq('job_id', jobId.data)
    .select('job_id');
  if (error) {
    logError('feed_dismiss_failed', error);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
  if (!data?.length) return apiErrorResponse('not_found', 'Match not found.', 404);
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
