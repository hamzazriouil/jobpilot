// The fit gauge card (docs/08-BRAND-UI.md §6.5): ring + "FIT SCORE" + band word + hint, then the
// must / nice / seniority breakdown. Score and band are the server's values only; until the final
// `result` arrives it shows a skeleton (the client never computes a score). When the user isn't
// eligible, the card is dimmed with "Fit shown for reference."
import type { AnalysisResult } from '@jobpilot/core/schemas';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import { FitScoreRing, FitScoreRingSkeleton } from './fit-score-ring';
import { LABEL_CLASS, QUIET_TEXT } from './tone';

export function FitCard({ result, dimmed }: { result: AnalysisResult | null; dimmed: boolean }) {
  const f = strings.results.fit;

  if (!result) {
    return (
      <Card className="h-full gap-0 py-4 sm:py-5">
        <CardContent className="grid content-start gap-4 px-4 sm:px-5">
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <FitScoreRingSkeleton />
            <div className="grid w-full gap-2.5">
              <h3 className={LABEL_CLASS}>{f.label}</h3>
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
          <p className={cn('font-mono text-xs', QUIET_TEXT)}>{f.scoring}</p>
        </CardContent>
      </Card>
    );
  }

  const must = tally(result, 'must');
  const nice = tally(result, 'nice');
  const levels = strings.results.levels;
  const you = levels[result.candidateLevel];
  const role = levels[result.job.level];

  return (
    <Card className={cn('h-full gap-0 py-4 sm:py-5', dimmed && 'opacity-70')}>
      <CardContent className="grid content-start gap-4 px-4 sm:px-5">
        {dimmed ? <p className="text-xs font-medium text-muted-foreground">{f.dimmedNote}</p> : null}
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <FitScoreRing score={result.score} band={result.band} />
          <div className="grid min-w-0 gap-1.5 text-center sm:text-left">
            <h3 className={LABEL_CLASS}>{f.label}</h3>
            <p className="text-[28px] leading-tight font-semibold tracking-[-0.02em] sm:text-3xl">{f.bands[result.band]}</p>
            <p className="text-sm text-pretty text-muted-foreground">{f.bandHints[result.band]}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-3">
          {must.total > 0 ? (
            <div className="grid gap-1">
              <dt className={LABEL_CLASS}>{f.mustHaves}</dt>
              <dd className="font-mono text-sm tabular-nums">{f.metCount(must.met, must.total)}</dd>
            </div>
          ) : null}
          {nice.total > 0 ? (
            <div className="grid gap-1">
              <dt className={LABEL_CLASS}>{f.niceToHaves}</dt>
              <dd className="font-mono text-sm tabular-nums">{f.metCount(nice.met, nice.total)}</dd>
            </div>
          ) : null}
          <div className="grid min-w-0 gap-1">
            <dt className={LABEL_CLASS}>{f.seniority}</dt>
            <dd className="font-mono text-sm break-words">
              <span aria-hidden="true">{f.levelChange(you, role)}</span>
              <span className="sr-only">{f.levelChangeAriaLabel(you, role)}</span>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** Display counts only (the score comes from the server). */
function tally(result: AnalysisResult, type: 'must' | 'nice') {
  const items = result.requirements.filter((r) => r.type === type);
  return { total: items.length, met: items.filter((r) => r.status === 'met').length };
}
