import type { SupabaseClient } from '@supabase/supabase-js';
import type { FitBand, HonestyFlag } from '@jobpilot/core/schemas';
import type { StatsApplication, StatsEvent } from '@/lib/stats';
import { APPLICATION_COLUMNS, byPosition, fromApplicationRow, type ApplicationRow, type Channel, type Stage, type TrackerItem } from '@/lib/tracker';

// Tracker reads for /tracker, /jobs/[id], /stats and the export (W16/W17). All run as the signed-in
// user (RLS: own applications only, and jobs the user can see). The fit shown on a card is the
// user's newest analysis of that job, whatever `applications.analysis_id` says, so an analysis run
// after tracking still shows up.

const TRACKER_SELECT = `${APPLICATION_COLUMNS}, jobs(title, company, url)`;

interface TrackerRow extends ApplicationRow {
  jobs: { title: string; company: string | null; url: string | null } | null;
}

/** All of the user's applications (or the one for `jobId`), with job and newest analysis. */
export async function loadTrackerItems(supabase: SupabaseClient, userId: string, opts: { jobId?: string } = {}): Promise<TrackerItem[]> {
  let query = supabase.from('applications').select(TRACKER_SELECT).eq('user_id', userId);
  if (opts.jobId) query = query.eq('job_id', opts.jobId);
  const { data, error } = await query.limit(1000);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as TrackerRow[]).filter((r) => r.jobs);
  const fits = await loadNewestFits(supabase, userId, rows.map((r) => r.job_id));
  return rows
    .map((r) => ({
      ...fromApplicationRow(r),
      title: r.jobs!.title,
      company: r.jobs!.company,
      url: r.jobs!.url,
      analysis: fits.get(r.job_id) ?? null,
    }))
    .sort(byPosition);
}

/** Newest analysis (highest profile version) per job. */
export async function loadNewestFits(
  supabase: SupabaseClient,
  userId: string,
  jobIds: string[],
): Promise<Map<string, { score: number; band: FitBand; id: string }>> {
  const out = new Map<string, { score: number; band: FitBand; id: string }>();
  if (jobIds.length === 0) return out;
  const { data, error } = await supabase
    .from('analyses')
    .select('id, job_id, score, band, profile_version')
    .eq('user_id', userId)
    .in('job_id', jobIds)
    .order('profile_version', { ascending: false });
  if (error) throw error;
  for (const a of (data ?? []) as Array<{ id: string; job_id: string; score: number; band: FitBand }>) {
    if (!out.has(a.job_id)) out.set(a.job_id, { score: a.score, band: a.band, id: a.id });
  }
  return out;
}

/** Job ids among `jobIds` that the user tracks. */
export async function trackedJobIds(supabase: SupabaseClient, userId: string, jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const { data, error } = await supabase.from('applications').select('job_id').eq('user_id', userId).in('job_id', jobIds);
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ job_id: string }>).map((r) => r.job_id));
}

export interface SavedFollowUp {
  message: string;
  honestyFlags: HonestyFlag[];
  createdAt: string;
}

/** The newest follow-up draft written for an application. */
export async function loadLatestFollowUp(supabase: SupabaseClient, applicationId: string): Promise<SavedFollowUp | null> {
  const { data, error } = await supabase
    .from('drafts')
    .select('content, honesty_flags, created_at')
    .eq('application_id', applicationId)
    .eq('kind', 'follow_up')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { message: data.content, honestyFlags: (data.honesty_flags ?? []) as HonestyFlag[], createdAt: data.created_at };
}

/** Inputs for computeStats (lib/stats.ts): applications with their newest fit band, and the stage log. */
export async function loadStatsInputs(supabase: SupabaseClient, userId: string): Promise<{ apps: StatsApplication[]; events: StatsEvent[] }> {
  const [appsRes, eventsRes] = await Promise.all([
    supabase.from('applications').select('id, job_id, stage, channel, applied_at').eq('user_id', userId).limit(1000),
    supabase.from('application_events').select('application_id, to_stage, at').eq('user_id', userId).order('at').limit(10000),
  ]);
  if (appsRes.error) throw appsRes.error;
  if (eventsRes.error) throw eventsRes.error;
  const rows = (appsRes.data ?? []) as Array<{ id: string; job_id: string; stage: Stage; channel: Channel | null; applied_at: string | null }>;
  const fits = await loadNewestFits(supabase, userId, rows.map((r) => r.job_id));
  return {
    apps: rows.map((r) => ({ id: r.id, stage: r.stage, channel: r.channel, appliedAt: r.applied_at, band: fits.get(r.job_id)?.band ?? null })),
    events: ((eventsRes.data ?? []) as Array<{ application_id: string; to_stage: Stage; at: string }>).map((e) => ({
      applicationId: e.application_id,
      toStage: e.to_stage,
      at: e.at,
    })),
  };
}
