import { z } from 'zod';
import { apiErrorResponse, badInput, describeZodError, INTERNAL_MESSAGE, logError, readJsonBody } from '@/lib/server/http';
import { loadNewestFits } from '@/lib/server/tracker';
import { APPLICATION_COLUMNS, CHANNELS, fromApplicationRow, STAGES, type ApplicationRow } from '@/lib/tracker';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// POST /api/applications { jobId, stage?, channel? } (docs/05-ARCHITECTURE.md §8, W16): tracks a job.
// Runs as the user: RLS allows tracking only jobs the user can see and linking only their own
// analysis. Tracking the same job twice returns the existing application (one per user and job).
// New cards go on top of their column (lowest position).

export const dynamic = 'force-dynamic';

const Body = z.object({
  jobId: z.uuid(),
  stage: z.enum(STAGES).default('saved'),
  channel: z.enum(CHANNELS).nullable().optional(),
});

const NO_STORE = { 'cache-control': 'no-store' };

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return badInput(describeZodError(parsed.error));
  const { jobId, stage, channel } = parsed.data;

  const supabase = await createSupabaseServer();
  const existing = async () => {
    const { data, error } = await supabase.from('applications').select(APPLICATION_COLUMNS).eq('user_id', userId).eq('job_id', jobId).maybeSingle();
    if (error) throw error;
    return data as ApplicationRow | null;
  };

  try {
    const found = await existing();
    if (found) return Response.json({ application: fromApplicationRow(found), created: false }, { headers: NO_STORE });

    const fit = (await loadNewestFits(supabase, userId, [jobId])).get(jobId);
    const { data, error } = await supabase
      .from('applications')
      .insert({
        user_id: userId,
        job_id: jobId,
        stage,
        channel: channel ?? null,
        analysis_id: fit?.id ?? null,
        position: -Date.now() / 1000,
      })
      .select(APPLICATION_COLUMNS)
      .single();
    if (error) {
      if (error.code === '23505') {
        const raced = await existing(); // a double click won the race
        if (raced) return Response.json({ application: fromApplicationRow(raced), created: false }, { headers: NO_STORE });
      }
      // RLS refused the row: the job doesn't exist or belongs to someone else.
      if (error.code === '42501') return apiErrorResponse('not_found', 'Job not found.', 404);
      throw error;
    }
    return Response.json({ application: fromApplicationRow(data as ApplicationRow), created: true }, { status: 201, headers: NO_STORE });
  } catch (err) {
    logError('application_create_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
}
