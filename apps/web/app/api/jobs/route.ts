import { classifyLocationRules, jobContentHash } from '@jobpilot/core/jobs';
import { JobText } from '@jobpilot/core/schemas';
import { z } from 'zod';
import { getRequestContext } from '@/lib/server/env';
import { apiErrorResponse, badInput, describeZodError, INTERNAL_MESSAGE, logError, readJsonBody } from '@/lib/server/http';
import { titleFromPaste } from '@/lib/server/paste';
import { supabaseAdmin } from '@/lib/server/supabase';
import { requireUser } from '@/lib/supabase/server';

// POST /api/jobs { jobText } → { jobId } (docs/05-ARCHITECTURE.md §8, PRD F1.6 paste). Creates a
// private job (owner_id = the user, source 'user_paste'). Authenticated users can't insert into
// `jobs` directly (02-DATABASE §6), so the row is written with the service role. Location fields
// come from the same rules the ingest uses; the analysis then quotes the post for eligibility.
// URL import (F1.6 P1) is not built yet.

export const dynamic = 'force-dynamic';

const Body = z.object({ jobText: JobText });

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const rc = await getRequestContext();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return badInput(describeZodError(parsed.error));
  const description = parsed.data.jobText;

  const db = supabaseAdmin(rc.env);
  if (!db) {
    logError('config_missing', 'Supabase service role is not configured');
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }

  try {
    const title = titleFromPaste(description);
    const location = classifyLocationRules({ locationRaw: null, description });
    const [row] = await db.insertReturning<{ id: string }>('jobs', {
      source_id: 'user_paste',
      owner_id: auth.user.id,
      title,
      description,
      eligibility_type: location.eligibilityType,
      allowed_regions: location.allowedRegions,
      eligibility_quote: location.quote,
      content_hash: await jobContentHash({ company: null, title, description }),
    });
    if (!row) throw new Error('insert returned no row');
    return Response.json({ jobId: row.id }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    logError('job_paste_failed', err);
    return apiErrorResponse('internal', INTERNAL_MESSAGE, 500);
  }
}
