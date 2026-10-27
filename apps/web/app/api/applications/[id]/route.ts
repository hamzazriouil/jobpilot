import { z } from 'zod';
import { apiErrorResponse, badInput, describeZodError, INTERNAL_MESSAGE, logError, readJsonBody } from '@/lib/server/http';
import {
  addDays,
  APPLICATION_COLUMNS,
  CHANNELS,
  FOLLOW_UP_DAYS,
  fromApplicationRow,
  NOTES_MAX,
  RESPONSE_STAGES,
  STAGES,
  type ApplicationRow,
} from '@/lib/tracker';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// PATCH /api/applications/:id { stage?, channel?, notes?, followUpDueAt?, position?, followedUp? }
// DELETE /api/applications/:id
// (docs/05-ARCHITECTURE.md §8, W16). Run as the user under RLS. The database triggers set applied_at
// and the first follow-up date when the stage becomes Applied, and log every stage change in
// application_events (that log feeds /stats). An answer stage (replied, interviewing, offer,
// rejected) records the contact time; `followedUp` records a follow-up sent and moves the next
// follow-up FOLLOW_UP_DAYS out.

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    stage: z.enum(STAGES),
    channel: z.enum(CHANNELS).nullable(),
    notes: z.string().max(NOTES_MAX).nullable(),
    followUpDueAt: z.iso.date().nullable(),
    position: z.number().finite(),
    followedUp: z.literal(true),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to update.');

const NO_STORE = { 'cache-control': 'no-store' };

async function parseId(ctx: { params: Promise<{ id: string }> }): Promise<string | null> {
  const id = z.uuid().safeParse((await ctx.params).id);
  return id.success ? id.data : null;
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const id = await parseId(ctx);
  if (!id) return apiErrorResponse('not_found', 'Application not found.', 404);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return badInput(describeZodError(parsed.error));
  const b = parsed.data;

  const now = new Date();
  const patch: Record<string, unknown> = {};
  if (b.stage !== undefined) patch.stage = b.stage;
  if (b.channel !== undefined) patch.channel = b.channel;
  if (b.notes !== undefined) patch.notes = b.notes?.trim() ? b.notes : null;
  if (b.followUpDueAt !== undefined) patch.follow_up_due_at = b.followUpDueAt;
  if (b.position !== undefined) patch.position = b.position;
  if (b.stage && RESPONSE_STAGES.has(b.stage)) patch.last_contact_at = now.toISOString();
  if (b.followedUp) {
    patch.last_contact_at = now.toISOString();
    patch.follow_up_due_at = addDays(now, FOLLOW_UP_DAYS);
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('applications')
    .update(patch)
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .select(APPLICATION_COLUMNS);
  if (error) {
    logError('application_update_failed', error);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
  const row = (data as ApplicationRow[] | null)?.[0];
  if (!row) return apiErrorResponse('not_found', 'Application not found.', 404);
  return Response.json({ application: fromApplicationRow(row) }, { headers: NO_STORE });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const id = await parseId(ctx);
  if (!id) return apiErrorResponse('not_found', 'Application not found.', 404);

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from('applications').delete().eq('id', id).eq('user_id', auth.user.id).select('id');
  if (error) {
    logError('application_delete_failed', error);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
  if (!data?.length) return apiErrorResponse('not_found', 'Application not found.', 404);
  return Response.json({ ok: true }, { headers: NO_STORE });
}
