import { redirect } from 'next/navigation';
import type { EligibilityVerdict, FitBand, Gap, Requirement } from '@jobpilot/core/schemas';
import { FeedView } from '@/components/feed/feed-view';
import { ONBOARDING_PATH } from '@/lib/auth/paths';
import { feedAnalysisFrom, parseAttribution, type FeedAnalysis, type FeedItem, type FeedStatus } from '@/lib/feed';
import { getRequestContext } from '@/lib/server/env';
import { logError } from '@/lib/server/http';
import {
  dailyMatchLimit,
  ensureTodayMatches,
  FEED_HISTORY_DAYS,
  FRESH_SHOWN,
  freshJobs,
  llmBudgetTight,
  loadPlan,
  matchAnalysesLeft,
  matchAnalyzeLimit,
  nextIngestAt,
  utcDay,
  type FreshJobs,
} from '@/lib/server/matching';
import { supabaseAdmin } from '@/lib/server/supabase';
import { trackedJobIds } from '@/lib/server/tracker';
import { strings } from '@/lib/strings';
import { createSupabaseServer, getUser } from '@/lib/supabase/server';

// /feed (docs/03-UI-UX.md §4.5, W14/W15). Builds today's matches on the first visit of the day
// (lib/server/matching.ts), then reads the last FEED_HISTORY_DAYS of matches with their jobs and
// the user's analyses, all through RLS. Cards without an analysis are analyzed from the client, up
// to the free feed allowance (`autoAnalyze`). Jobs added after today's matches were picked show in
// "New today" (no auto analysis), under a line saying when job sources were last checked.

export const metadata = { title: strings.feed.title };

const JOB_COLUMNS = 'title, url, company, location_raw, eligibility_type, allowed_regions, tags, posted_at, ingested_at, sources(name, attribution)';

interface JobRow {
  title: string;
  url: string | null;
  company: string | null;
  location_raw: string | null;
  eligibility_type: FeedItem['eligibilityType'];
  allowed_regions: string[] | null;
  tags: string[] | null;
  posted_at: string | null;
  ingested_at: string;
  sources: { name: string; attribution: string | null } | null;
}

interface MatchRow {
  job_id: string;
  match_date: string;
  rank: number;
  dismissed: boolean;
  jobs: JobRow | null;
}

interface AnalysisSummaryRow {
  job_id: string;
  profile_version: number;
  score: number;
  band: FitBand;
  eligibility: EligibilityVerdict;
  requirements: Pick<Requirement, 'type' | 'status'>[];
  gaps: Pick<Gap, 'skill'>[];
}

export default async function FeedPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const supabase = await createSupabaseServer();
  const { data: profile } = await supabase.from('profiles').select('onboarded_at, profile_version').eq('id', user.id).maybeSingle();
  if (!profile?.onboarded_at) redirect(ONBOARDING_PATH);

  const rc = await getRequestContext();
  const db = supabaseAdmin(rc.env);
  const plan = await loadPlan(supabase, user.id);
  const now = new Date();
  const today = utcDay(now);
  let autoAnalyze = 0;
  let fresh: FreshJobs | null = null;
  if (db) {
    try {
      await ensureTodayMatches(db, user.id, { limit: dailyMatchLimit(plan), now });
      autoAnalyze = await matchAnalysesLeft(db, user.id, matchAnalyzeLimit(plan, await llmBudgetTight(db, now)), now);
    } catch (err) {
      logError('feed_matching_failed', err);
    }
    // After ensureTodayMatches, so today's matches aren't listed again as new.
    fresh = await freshJobs(db, user.id, now).catch((err: unknown) => {
      logError('feed_fresh_failed', err);
      return null;
    });
  }

  const since = utcDay(new Date(now.getTime() - FEED_HISTORY_DAYS * 86_400_000));
  const { data: matchData, error: matchError } = await supabase
    .from('daily_matches')
    .select(`job_id, match_date, rank, dismissed, jobs(${JOB_COLUMNS})`)
    .eq('user_id', user.id)
    .gte('match_date', since)
    .order('match_date', { ascending: false })
    .order('rank', { ascending: true })
    .limit(200);
  if (matchError) logError('feed_load_failed', matchError);
  const matches = ((matchData ?? []) as unknown as MatchRow[]).filter((m) => m.jobs);

  const freshIds = fresh?.openIds.slice(0, FRESH_SHOWN) ?? [];
  let freshRows: Array<{ id: string } & JobRow> = [];
  if (freshIds.length > 0) {
    const { data, error } = await supabase.from('jobs').select(`id, ${JOB_COLUMNS}`).in('id', freshIds);
    if (error) logError('feed_fresh_load_failed', error);
    const byId = new Map(((data ?? []) as unknown as Array<{ id: string } & JobRow>).map((j) => [j.id, j]));
    freshRows = freshIds.flatMap((id) => byId.get(id) ?? []);
  }

  const analyses = new Map<string, FeedAnalysis>();
  const analysisIds = [...matches.map((m) => m.job_id), ...freshRows.map((j) => j.id)];
  const tracked = await trackedJobIds(supabase, user.id, analysisIds).catch((err: unknown) => {
    logError('feed_tracked_failed', err);
    return new Set<string>();
  });
  if (analysisIds.length > 0) {
    const { data, error } = await supabase
      .from('analyses')
      .select('job_id, profile_version, score, band, eligibility, requirements, gaps')
      .eq('user_id', user.id)
      .in('job_id', analysisIds)
      .order('profile_version', { ascending: false });
    if (error) logError('feed_analyses_failed', error);
    for (const a of (data ?? []) as AnalysisSummaryRow[]) {
      if (analyses.has(a.job_id)) continue; // newest profile version first
      analyses.set(
        a.job_id,
        feedAnalysisFrom(
          { score: a.score, band: a.band, verdict: a.eligibility, requirements: a.requirements ?? [], gaps: a.gaps ?? [] },
          a.profile_version === profile.profile_version,
        ),
      );
    }
  }

  const toItem = (jobId: string, j: JobRow, matchDate: string, dismissed: boolean): FeedItem => ({
    jobId,
    matchDate,
    dismissed,
    title: j.title,
    company: j.company,
    locationRaw: j.location_raw,
    eligibilityType: j.eligibility_type,
    allowedRegions: j.allowed_regions ?? [],
    tags: (j.tags ?? []).slice(0, 4),
    postedAt: j.posted_at,
    url: j.url,
    attribution: parseAttribution(j.sources?.attribution ?? j.sources?.name ?? null),
    analysis: analyses.get(jobId) ?? null,
    tracked: tracked.has(jobId),
  });
  const items = matches.map((m) => toItem(m.job_id, m.jobs!, m.match_date, m.dismissed));
  const freshItems = freshRows.map((j) => toItem(j.id, j, today, false));

  let status: FeedStatus | null = null;
  if (fresh?.lastCheckedAt) {
    const dayStart = `${today}T00:00:00Z`;
    const matchedToday = matches.filter((m) => m.match_date === today && new Date(m.jobs!.ingested_at) >= new Date(dayStart)).length;
    status = {
      lastCheckedAt: fresh.lastCheckedAt,
      newToday: fresh.newToday,
      open: fresh.openIds.length + matchedToday,
      nextAt: nextIngestAt(now).toISOString(),
    };
  }

  return <FeedView items={items} fresh={freshItems} status={status} today={today} autoAnalyze={autoAnalyze} loadFailed={Boolean(matchError)} />;
}
