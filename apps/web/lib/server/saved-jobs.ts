import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AnalysisResult,
  CvBullet,
  HonestyFlag,
  type DraftResultEvent,
  type FitBand,
  type Seniority,
} from '@jobpilot/core/schemas';
import { z } from 'zod';

// Saved jobs, analyses and drafts for signed-in users (docs/09-PHASE1-CONTRACT.md §6, W12).
// Reads go through the user's RLS client (a job is visible when it's public or theirs), writes
// through the service role (analyses and drafts are server-written). This file maps DB rows to the
// same AnalysisResult / DraftResultEvent shapes the v0 analyzer streams, so one results view
// renders both.

export interface ProfileForAnalysis {
  cvText: string;
  country: string;
  profileVersion: number;
}

/** The signed-in user's CV, country and profile version, or null when onboarding isn't done. */
export async function loadProfileForAnalysis(supabase: SupabaseClient, userId: string): Promise<ProfileForAnalysis | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('cv_text, country_code, profile_version')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.cv_text || !data.country_code) return null;
  return { cvText: data.cv_text, country: String(data.country_code).trim(), profileVersion: data.profile_version };
}

export interface SavedJob {
  id: string;
  sourceId: string;
  ownerId: string | null;
  url: string | null;
  title: string;
  company: string | null;
  description: string;
  locationRaw: string | null;
  postedAt: string | null;
  expiresAt: string | null;
}

export async function loadJob(supabase: SupabaseClient, jobId: string): Promise<SavedJob | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, source_id, owner_id, url, title, company, description, location_raw, posted_at, expires_at')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    sourceId: data.source_id,
    ownerId: data.owner_id,
    url: data.url,
    title: data.title,
    company: data.company,
    description: data.description,
    locationRaw: data.location_raw,
    postedAt: data.posted_at,
    expiresAt: data.expires_at,
  };
}

export interface AnalysisRow {
  id: string;
  user_id: string;
  job_id: string;
  profile_version: number;
  eligibility: string;
  eligibility_detail: unknown;
  requirements: unknown;
  gaps: unknown;
  red_flags: unknown;
  job_level: Seniority | null;
  candidate_level: Seniority | null;
  score: number;
  band: FitBand;
  evidence_downgrades: number;
  provider: string;
  model: string;
  prompt_version: string;
  created_at: string;
}

const ANALYSIS_COLUMNS =
  'id, user_id, job_id, profile_version, eligibility, eligibility_detail, requirements, gaps, red_flags, job_level, candidate_level, score, band, evidence_downgrades, provider, model, prompt_version, created_at';

/** Columns for an `analyses` insert (the cache key is user, job, profile_version). */
export function analysisToRow(result: AnalysisResult, ids: { userId: string; jobId: string; profileVersion: number }) {
  return {
    user_id: ids.userId,
    job_id: ids.jobId,
    profile_version: ids.profileVersion,
    eligibility: result.eligibility.verdict,
    eligibility_detail: result.eligibility,
    requirements: result.requirements,
    gaps: result.gaps,
    red_flags: result.redFlags,
    job_level: result.job.level,
    candidate_level: result.candidateLevel,
    score: result.score,
    band: result.band,
    evidence_downgrades: result.evidenceDowngrades,
    provider: result.provider,
    model: result.model,
    prompt_version: result.promptVersion,
  };
}

/** Rebuilds the AnalysisResult the analyzer renders. Null if a stored row no longer validates. */
export function analysisFromRow(row: AnalysisRow, job: Pick<SavedJob, 'title' | 'company'>): AnalysisResult | null {
  const parsed = AnalysisResult.safeParse({
    job: { title: job.title, company: job.company, level: row.job_level ?? row.candidate_level ?? 'mid' },
    candidateLevel: row.candidate_level ?? 'junior',
    eligibility: row.eligibility_detail,
    requirements: row.requirements,
    gaps: row.gaps,
    redFlags: row.red_flags,
    score: row.score,
    band: row.band,
    evidenceDowngrades: row.evidence_downgrades,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
  });
  return parsed.success ? parsed.data : null;
}

/** The cached analysis for (user, job, profile_version), if any. */
export async function loadAnalysis(
  supabase: SupabaseClient,
  ids: { userId: string; jobId: string; profileVersion: number },
): Promise<AnalysisRow | null> {
  const { data, error } = await supabase
    .from('analyses')
    .select(ANALYSIS_COLUMNS)
    .eq('user_id', ids.userId)
    .eq('job_id', ids.jobId)
    .eq('profile_version', ids.profileVersion)
    .maybeSingle();
  if (error) throw error;
  return (data as AnalysisRow | null) ?? null;
}

export async function loadAnalysisById(supabase: SupabaseClient, analysisId: string): Promise<AnalysisRow | null> {
  const { data, error } = await supabase.from('analyses').select(ANALYSIS_COLUMNS).eq('id', analysisId).maybeSingle();
  if (error) throw error;
  return (data as AnalysisRow | null) ?? null;
}

// ── drafts ──

type DraftKind = 'cover_letter' | 'cold_dm' | 'cv_bullets' | 'follow_up';

const FLAG_KIND: Record<HonestyFlag['draft'], DraftKind> = {
  coverLetter: 'cover_letter',
  coldDm: 'cold_dm',
  cvBullet: 'cv_bullets',
  followUp: 'follow_up',
};

/** Three `drafts` rows (one per kind), each with its own honesty flags. cv_bullets is JSON text. */
export function draftsToRows(event: DraftResultEvent, meta: { userId: string; analysisId: string; provider: string; model: string; promptVersion: string }) {
  const base = { user_id: meta.userId, analysis_id: meta.analysisId, provider: meta.provider, model: meta.model, prompt_version: meta.promptVersion };
  const flags = (kind: DraftKind) => event.honestyFlags.filter((f) => FLAG_KIND[f.draft] === kind);
  return [
    { ...base, kind: 'cover_letter', content: event.drafts.coverLetter, honesty_flags: flags('cover_letter') },
    { ...base, kind: 'cold_dm', content: event.drafts.coldDm, honesty_flags: flags('cold_dm') },
    { ...base, kind: 'cv_bullets', content: JSON.stringify(event.drafts.cvBullets), honesty_flags: flags('cv_bullets') },
  ];
}

const StoredFlags = z.array(HonestyFlag).catch([]);
const StoredBullets = z.array(CvBullet);

/** The latest saved draft set for an analysis, as the DraftResultEvent the draft tabs render. */
export async function loadDrafts(supabase: SupabaseClient, analysisId: string): Promise<DraftResultEvent | null> {
  const { data, error } = await supabase
    .from('drafts')
    .select('kind, content, honesty_flags, created_at')
    .eq('analysis_id', analysisId)
    .in('kind', ['cover_letter', 'cold_dm', 'cv_bullets'])
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  const latest = new Map<string, { content: string; honesty_flags: unknown }>();
  for (const row of data ?? []) if (!latest.has(row.kind)) latest.set(row.kind, row);
  const cover = latest.get('cover_letter');
  const dm = latest.get('cold_dm');
  const bullets = latest.get('cv_bullets');
  if (!cover || !dm || !bullets) return null;
  let cvBullets: z.infer<typeof StoredBullets>;
  try {
    cvBullets = StoredBullets.parse(JSON.parse(bullets.content));
  } catch {
    cvBullets = [];
  }
  return {
    drafts: { coverLetter: cover.content, coldDm: dm.content, cvBullets },
    honestyFlags: [cover, dm, bullets].flatMap((r) => StoredFlags.parse(r.honesty_flags)),
  };
}
