import { z } from 'zod';
import { getRequestContext } from '@/lib/server/env';
import { apiErrorResponse, badInput, INTERNAL_MESSAGE, logError, readJsonBody } from '@/lib/server/http';
import { deleteAuthUser } from '@/lib/server/supabase';
import { createSupabaseServer, requireUser } from '@/lib/supabase/server';

// DELETE /api/account { confirm: "DELETE" } (docs/05-ARCHITECTURE.md §8, PRD F1.10, W17).
// Deletes the auth user with the service role; every user table references profiles (or auth.users)
// with ON DELETE CASCADE, so the profile, CV, pasted jobs, analyses, drafts, applications, events
// and matches go with it (tested in supabase/tests/account.test.ts). Payments keep their row with
// user_id set to null (accounting). The session cookies are cleared first, so the browser is
// signed out even though the access token stays valid until it expires.

export const dynamic = 'force-dynamic';

const Body = z.object({ confirm: z.literal('DELETE') });

export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  if (!Body.safeParse(body.value).success) return badInput('Type DELETE to confirm.');

  const rc = await getRequestContext();
  try {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined);
    await deleteAuthUser(rc.env, auth.user.id);
  } catch (err) {
    logError('account_delete_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
