'use client';

// Analysis + drafts on /jobs/[id] (docs/03-UI-UX.md §4.6, W12). A saved analysis renders as a
// finished run through the same ResultsView as the landing analyzer; otherwise "Analyze this job"
// streams a new one from /api/jobs/:id/analyze, and drafts follow from /api/jobs/:id/draft.
// Saved drafts render the same way; "Redo" streams a new set (3 rewrites a day).
import { Play } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AnalysisResult, DraftResultEvent } from '@jobpilot/core/schemas';
import { ResultsView } from '@/components/analyzer/results-view';
import { Button, buttonVariants } from '@/components/ui/button';
import { useSavedAnalyzeStream, useSavedDraftStream, type AnalyzeTask, type DraftTask } from '@/lib/client/use-stream-task';
import { strings } from '@/lib/strings';

export interface SavedAnalysis {
  analysisId: string;
  result: AnalysisResult;
  /** False when the user's profile changed since (the analysis is from an older profile_version). */
  current: boolean;
  createdAt: string;
}

export function JobAnalysis({
  jobId,
  countryName,
  saved,
  savedDrafts,
  hasProfile,
}: {
  jobId: string;
  countryName: string;
  saved: SavedAnalysis | null;
  savedDrafts: DraftResultEvent | null;
  hasProfile: boolean;
}) {
  const s = strings.jobs.detail;
  const analyze = useSavedAnalyzeStream();
  const draft = useSavedDraftStream();
  const analysisId = useRef<string | null>(saved?.current ? saved.analysisId : null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A stream that ran on this page wins over what was saved when the page loaded.
  const analysisState: AnalyzeTask['state'] =
    analyze.state.status !== 'idle'
      ? analyze.state
      : saved
        ? { status: 'done', partial: null, result: { result: saved.result, analysisToken: '', analysisId: saved.analysisId } }
        : { status: 'idle' };
  const draftState: DraftTask['state'] =
    draft.state.status !== 'idle' ? draft.state : savedDrafts && saved?.current ? { status: 'done', partial: null, result: savedDrafts } : { status: 'idle' };

  async function runAnalysis() {
    draft.reset();
    const done = await analyze.start(`/api/jobs/${jobId}/analyze`, {});
    if (done?.analysisId) {
      analysisId.current = done.analysisId;
      void runDrafts();
    }
  }

  async function runDrafts() {
    if (!analysisId.current) return;
    await draft.start(`/api/jobs/${jobId}/draft`, { analysisId: analysisId.current });
  }

  useEffect(() => {
    if (analyze.state.status === 'streaming') headingRef.current?.focus({ preventScroll: true });
  }, [analyze.state.status]);

  if (!hasProfile) {
    return (
      <div className="mt-10 rounded-xl border bg-card p-5 sm:p-6">
        <p className="text-sm text-pretty text-muted-foreground">{s.needsProfile}</p>
        <a href="/onboarding" className={buttonVariants({ className: 'mt-4' })}>
          {s.setUpProfile}
        </a>
      </div>
    );
  }

  const running = analyze.state.status === 'streaming';
  const stale = analyze.state.status === 'idle' && saved && !saved.current;

  return (
    <div className="mt-10">
      {analysisState.status === 'idle' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => void runAnalysis()}>
            <Play aria-hidden="true" className="size-4" />
            {s.analyze}
          </Button>
          <span className="font-mono text-xs text-subtle">{s.analyzeHint}</span>
        </div>
      ) : (
        <>
          {stale && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-partial/40 p-3 text-sm">
              <span className="text-pretty text-muted-foreground">{s.reanalyzeNote}</span>
              <Button variant="outline" onClick={() => void runAnalysis()}>
                {s.reanalyze}
              </Button>
            </div>
          )}
          <ResultsView
            state={analysisState}
            countryName={countryName}
            onRetry={() => void runAnalysis()}
            draftState={draftState}
            onRedoDrafts={() => void runDrafts()}
            headingRef={headingRef}
          />
          {analysisState.status === 'done' && draftState.status === 'idle' && analysisId.current && !running && (
            <Button className="mt-4" onClick={() => void runDrafts()}>
              {s.writeDrafts}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
