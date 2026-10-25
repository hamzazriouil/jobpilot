import { z } from 'zod';
import { JobAnalysis, type SavedAnalysis } from '@/components/jobs/job-analysis';
import {
  analysisFromRow,
  loadAnalysis,
  loadAnalysisById,
  loadDrafts,
  loadJob,
  loadProfileForAnalysis,
  type AnalysisRow,
} from '@/lib/server/saved-jobs';
import { strings } from '@/lib/strings';
import { createSupabaseServer, getUser } from '@/lib/supabase/server';

// /jobs/[id] (docs/03-UI-UX.md §4.6): job meta, source attribution and the original link (as the
// source terms require, docs/10-SOURCES.md: the link is kept unchanged and is a normal followed
// link), the description, and the saved analysis + drafts (or "Analyze this job").
// The tracker panel joins on Day 4.

export const metadata = { title: 'Job' };

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmt = (iso: string) => dateFmt.format(new Date(iso));

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const s = strings.jobs.detail;
  const id = z.uuid().safeParse((await params).id);
  const user = await getUser();
  const supabase = await createSupabaseServer();
  const job = id.success && user ? await loadJob(supabase, id.data) : null;

  if (!job || !user) {
    return (
      <section className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">{s.notFound}</h1>
        <p className="mt-3 text-muted-foreground">{s.notFoundBody}</p>
      </section>
    );
  }

  const [profile, source] = await Promise.all([
    loadProfileForAnalysis(supabase, user.id),
    supabase.from('sources').select('name, attribution').eq('id', job.sourceId).maybeSingle(),
  ]);

  let saved: SavedAnalysis | null = null;
  let savedDrafts = null;
  if (profile) {
    let row: AnalysisRow | null = await loadAnalysis(supabase, { userId: user.id, jobId: job.id, profileVersion: profile.profileVersion });
    let current = true;
    if (!row) {
      // An analysis from an older profile version is still worth showing, with a "re-analyze" note.
      const { data } = await supabase
        .from('analyses')
        .select('id')
        .eq('user_id', user.id)
        .eq('job_id', job.id)
        .order('profile_version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        row = await loadAnalysisById(supabase, data.id);
        current = false;
      }
    }
    const result = row ? analysisFromRow(row, job) : null;
    if (row && result) {
      saved = { analysisId: row.id, result, current, createdAt: row.created_at };
      if (current) savedDrafts = await loadDrafts(supabase, row.id);
    }
  }

  const countryName = (() => {
    const code = profile?.country;
    if (!code) return '';
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
    } catch {
      return code;
    }
  })();
  const pasted = job.sourceId === 'user_paste';
  const expired = job.expiresAt !== null && new Date(job.expiresAt) < new Date();
  const attribution = source.data?.attribution ?? source.data?.name ?? null;

  return (
    <article>
      <a href="/feed" className="font-mono text-xs text-subtle hover:text-foreground">
        ← {s.back}
      </a>
      <header className="mt-4 max-w-3xl">
        <h1 className="text-3xl leading-tight font-bold tracking-[-0.03em] text-balance sm:text-4xl">{job.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {job.company && <span>{job.company}</span>}
          {job.locationRaw && <span>{job.locationRaw}</span>}
          {job.postedAt && <span>{s.postedOn(fmt(job.postedAt))}</span>}
          <span className="font-mono text-xs leading-5 text-subtle">{pasted ? s.pasted : attribution}</span>
          {job.url && (
            <a href={job.url} target="_blank" rel="noopener" className="text-signal-text underline underline-offset-4 hover:text-foreground">
              {s.original} ↗
            </a>
          )}
        </p>
        {expired && <p className="mt-3 text-sm text-partial">{s.expired}</p>}
        {saved && <p className="mt-2 font-mono text-xs text-subtle">{s.savedOn(fmt(saved.createdAt))}</p>}
      </header>

      <details className="mt-6 max-w-3xl rounded-xl border bg-card">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">{s.description}</summary>
        <div className="border-t px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{job.description}</div>
      </details>

      <JobAnalysis jobId={job.id} countryName={countryName} saved={saved} savedDrafts={savedDrafts} hasProfile={profile !== null} />
    </article>
  );
}
