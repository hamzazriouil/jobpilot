// Fit block: score ring + band (server values only) and the must / nice / seniority summary.
// Shows a skeleton until the final `result` arrives; the client never computes a score.
// When the user isn't eligible, the card is dimmed with "Fit shown for reference."
import type { AnalysisResult } from '@jobpilot/core/schemas';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import { FitScoreRing, FitScoreRingSkeleton } from './fit-score-ring';
import { ResultCard } from './result-card';
import { BAND_TONE, TONE_CLASSES } from './tone';

export function FitCard({ result, dimmed }: { result: AnalysisResult | null; dimmed: boolean }) {
  const f = strings.results.fit;

  if (!result) {
    return (
      <ResultCard title={f.title}>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <FitScoreRingSkeleton />
          <div className="grid w-full gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{f.scoring}</p>
      </ResultCard>
    );
  }

  const must = tally(result, 'must');
  const nice = tally(result, 'nice');
  const levels = strings.results.levels;
  const you = levels[result.candidateLevel];
  const role = levels[result.job.level];
  const tone = TONE_CLASSES[BAND_TONE[result.band]];

  return (
    <ResultCard title={f.title} className={cn(dimmed && 'opacity-70')}>
      {dimmed ? <p className="mb-3 text-xs font-medium text-muted-foreground">{f.dimmedNote}</p> : null}
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <FitScoreRing score={result.score} band={result.band} />
        <div className="grid w-full min-w-0 gap-3">
          <div>
            <p className={cn('font-mono text-sm font-semibold tracking-wide uppercase', tone.text)}>
              {f.bands[result.band]}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{f.bandHints[result.band]}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {must.total > 0 ? (
              <>
                <dt className="text-muted-foreground">{f.mustHaves}</dt>
                <dd className="font-mono tabular-nums">{f.metCount(must.met, must.total)}</dd>
              </>
            ) : null}
            {nice.total > 0 ? (
              <>
                <dt className="text-muted-foreground">{f.niceToHaves}</dt>
                <dd className="font-mono tabular-nums">{f.metCount(nice.met, nice.total)}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{f.seniority}</dt>
            <dd className="font-mono">
              <span aria-hidden="true">{f.levelChange(you, role)}</span>
              <span className="sr-only">{f.levelChangeAriaLabel(you, role)}</span>
            </dd>
          </dl>
        </div>
      </div>
      {result.evidenceDowngrades > 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">{f.downgrades(result.evidenceDowngrades)}</p>
      ) : null}
    </ResultCard>
  );
}

/** Display counts only (the score comes from the server). */
function tally(result: AnalysisResult, type: 'must' | 'nice') {
  const items = result.requirements.filter((r) => r.type === type);
  return { total: items.length, met: items.filter((r) => r.status === 'met').length };
}
