'use client';

// The results layout (docs/03-UI-UX.md §4.2): run status, eligibility + fit gauge, evidence trace,
// gaps / red flags, model line, drafts. Shared by the landing analyzer (streamed v0 run) and the
// saved-job page (/jobs/[id]: a stored analysis rendered as a finished run, or a new streamed one).
import type { ReactNode, Ref } from 'react';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { EMPTY_PARTIAL_ANALYSIS, type PartialAnalysis } from '@/lib/client/partial';
import type { StreamError } from '@/lib/client/stream';
import type { AnalyzeTask, DraftTask } from '@/lib/client/use-stream-task';
import { DraftTabs } from './draft-tabs';
import { EligibilityCard, EligibilitySkeleton } from './eligibility-card';
import { FitCard } from './fit-card';
import { GapList, RedFlagList } from './gap-lists';
import { RequirementList } from './requirement-list';
import { StreamNotice } from './stream-notice';
import { QUIET_TEXT, TONE_CLASSES, TONE_GLYPH } from './tone';

export interface ResultsViewProps {
  /** Not 'idle': the caller renders nothing before a run. */
  state: Exclude<AnalyzeTask['state'], { status: 'idle' }>;
  countryName: string;
  onRetry: () => void;
  draftState: DraftTask['state'];
  onRedoDrafts: () => void;
  sectionRef?: Ref<HTMLElement>;
  headingRef?: Ref<HTMLHeadingElement>;
  heading?: string;
}

export function ResultsView({ state: aState, countryName, onRetry, draftState, onRedoDrafts, sectionRef, headingRef, heading }: ResultsViewProps) {
  const analyzing = aState.status === 'streaming';
  const result = aState.status === 'done' ? aState.result.result : null;
  const view: PartialAnalysis = result ?? aState.partial ?? EMPTY_PARTIAL_ANALYSIS;
  const hasPartial =
    !!view.eligibility?.verdict || view.requirements.length > 0 || view.gaps.length > 0 || view.redFlags.length > 0;
  const showEligibility = !!view.eligibility?.verdict || analyzing;
  const showFit = !!result || analyzing;
  const showGaps = view.gaps.length > 0 || analyzing || !!result;
  const showRedFlags = view.redFlags.length > 0;

  return (
    <section ref={sectionRef} aria-labelledby="results-heading" className="mt-12 grid scroll-mt-20 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            id="results-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-[28px] leading-tight font-semibold tracking-[-0.03em] outline-none sm:text-[32px]"
          >
            {heading ?? strings.results.heading}
          </h2>
          {view.job?.title ? (
            <p className="mt-1 text-sm break-words text-muted-foreground">
              {strings.results.jobLine(view.job.title, view.job.company)}
            </p>
          ) : null}
        </div>
        <RunStatus status={aState.status} error={aState.status === 'error' ? aState.error : null} />
      </div>

      {aState.status === 'error' ? (
        <div className="grid gap-2">
          <StreamNotice error={aState.error} context="analyze" onRetry={onRetry} />
          {hasPartial && aState.error.code !== 'aborted' && aState.error.code !== 'incomplete' ? (
            <p className="text-xs text-muted-foreground">{strings.states.partialNote}</p>
          ) : null}
        </div>
      ) : null}

      <div aria-busy={analyzing} className={cn('grid gap-4', aState.status === 'error' && 'opacity-80')}>
        {/* Verdict strip: eligibility first (left / top), then the fit gauge. */}
        {showEligibility || showFit ? (
          <div className="grid gap-4 md:grid-cols-2">
            {showEligibility ? (
              <div className="min-w-0 md:only:col-span-2">
                {view.eligibility?.verdict ? (
                  <EligibilityCard eligibility={view.eligibility} countryName={countryName} />
                ) : (
                  <EligibilitySkeleton />
                )}
              </div>
            ) : null}
            {showFit ? (
              <div className="min-w-0 md:only:col-span-2">
                <FitCard result={result} dimmed={result?.eligibility.verdict === 'not_eligible'} />
              </div>
            ) : null}
          </div>
        ) : null}

        {view.requirements.length > 0 || analyzing ? (
          <RequirementList requirements={view.requirements} streaming={analyzing} result={result} />
        ) : null}

        {showGaps || showRedFlags ? (
          <div className="grid gap-4 md:grid-cols-2">
            {showGaps ? (
              <div className="min-w-0 md:only:col-span-2">
                <GapList gaps={view.gaps} streaming={analyzing} />
              </div>
            ) : null}
            {showRedFlags ? (
              <div className="min-w-0 md:only:col-span-2">
                <RedFlagList redFlags={view.redFlags} />
              </div>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <p className={cn('font-mono text-[11px] break-words', QUIET_TEXT)}>
            {strings.results.meta(result.model, result.promptVersion)}
          </p>
        ) : null}
      </div>

      <DraftTabs state={draftState} onRedo={onRedoDrafts} />
    </section>
  );
}

/** Mono run status on the right of the results header. Decorative: the live region announces progress. */
function RunStatus({ status, error }: { status: 'streaming' | 'done' | 'error'; error: StreamError | null }) {
  const s = strings.results.runStatus;
  let content: ReactNode;
  if (status === 'streaming') {
    content = (
      <span className={cn('inline-flex items-center gap-2', TONE_CLASSES.good.text)}>
        <span className="size-2 animate-live rounded-full bg-signal" />
        {s.streaming}
      </span>
    );
  } else if (status === 'done') {
    content = <span className={TONE_CLASSES.good.text}>{`${TONE_GLYPH.good} ${s.done}`}</span>;
  } else if (error?.code === 'aborted') {
    content = <span className={QUIET_TEXT}>{`■ ${s.stopped}`}</span>;
  } else if (error?.code === 'quota_exceeded' || error?.code === 'busy' || error?.code === 'bad_input') {
    // Not a failure of the analysis: a limit, a busy provider or an input to fix (calm tone, 03-UI-UX §7).
    const label = error.code === 'quota_exceeded' ? s.limit : error.code === 'busy' ? s.busy : s.checkInput;
    content = <span className={TONE_CLASSES.warn.text}>{`${TONE_GLYPH.warn} ${label}`}</span>;
  } else {
    content = <span className={TONE_CLASSES.bad.text}>{`${TONE_GLYPH.bad} ${s.failed}`}</span>;
  }
  return (
    <p aria-hidden="true" className="pb-1 font-mono text-xs">
      {content}
    </p>
  );
}
