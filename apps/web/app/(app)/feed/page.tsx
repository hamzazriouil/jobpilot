import { redirect } from 'next/navigation';
import type { EligibilityVerdict, FitBand, Gap, Requirement } from '@jobpilot/core/schemas';
import { FeedView } from '@/components/feed/feed-view';
import { ONBOARDING_PATH } from '@/lib/auth/paths';
import { feedAnalysisFrom, parseAttribution, type FeedAnalysis, type FeedItem } from '@/lib/feed';
import { getRequestContext } from '@/lib/server/env';
import { logError } from '@/lib/server/http';
import {
  dailyMatchLimit,
  ensureTodayMatches,
  FEED_HISTORY_DAYS,
  llmBudgetTight,
  loadPlan,
  matchAnalysesLeft,
  matchAnalyzeLimit,
  utcDay,
} from '@/lib/server/matching';
import { supabaseAdmin } from '@/lib/server/supabase';
import { strings } from '@/lib/strings';
import { createSupabaseServer, getUser } from '@/lib/supabase/server';

// /feed (docs/03-UI-UX.md §4.5, W14/W15). Builds today's matches on the first visit of the day
// (lib/server/matching.ts), then reads the last FEED_HISTORY_DAYS of matches with their jobs and
// the user's analyses, all through RLS. Cards without an analysis are analyzed from the client, up
// to the free feed allowance (`autoAnalyze`).

export const metadata = { title: strings.feed.title };

interface MatchRow {
  job_id: string;
  match_date: string;
  rank: number;
  dismissed: boolean;
  jobs: {
    title: string;
    url: string | null;
    company: string | null;
    location_raw: string | null;
    eligibility_type: FeedItem['eligibilityType'];
    allowed_regions: string[] | null;
    tags: string[] | null;
    posted_at: string | null;
    sources: { name: string; attribution: string | null } | null;
  } | null;
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
  let autoAnalyze = 0;
  if (db) {
    try {
      await ensureTodayMatches(db, user.id, { limit: dailyMatchLimit(plan), now });
      autoAnalyze = await matchAnalysesLeft(db, user.id, matchAnalyzeLimit(plan, await llmBudgetTight(db, now)), now);
    } catch (err) {
      logError('feed_matching_failed', err);
    }
  }

  const since = utcDay(new Date(now.getTime() - FEED_HISTORY_DAYS * 86_400_000));
  const { data: matchData, error: matchError } = await supabase
    .from('daily_matches')
    .select('job_id, match_date, rank, dismissed, jobs(title, url, company, location_raw, eligibility_type, allowed_regions, tags, posted_at, sources(name, attribution))')
    .eq('user_id', user.id)
    .gte('match_date', since)
    .order('match_date', { ascending: false })
    .order('rank', { ascending: true })
    .limit(200);
  if (matchError) logError('feed_load_failed', matchError);
  const matches = ((matchData ?? []) as unknown as MatchRow[]).filter((m) => m.jobs);

  const analyses = new Map<string, FeedAnalysis>();
  if (matches.length > 0) {
    const { data, error } = await supabase
      .from('analyses')
      .select('job_id, profile_version, score, band, eligibility, requirements, gaps')
      .eq('user_id', user.id)
      .in('job_id', matches.map((m) => m.job_id))
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

  const items: FeedItem[] = matches.map((m) => {
    const j = m.jobs!;
    return {
      jobId: m.job_id,
      matchDate: m.match_date,
      dismissed: m.dismissed,
      title: j.title,
      company: j.company,
      locationRaw: j.location_raw,
      eligibilityType: j.eligibility_type,
      allowedRegions: j.allowed_regions ?? [],
      tags: (j.tags ?? []).slice(0, 4),
      postedAt: j.posted_at,
      url: j.url,
      attribution: parseAttribution(j.sources?.attribution ?? j.sources?.name ?? null),
      analysis: analyses.get(m.job_id) ?? null,
    };
  });

  return <FeedView items={items} today={utcDay(now)} autoAnalyze={autoAnalyze} loadFailed={Boolean(matchError)} />;
}
