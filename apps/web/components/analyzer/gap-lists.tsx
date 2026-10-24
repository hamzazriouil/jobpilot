// "Close the gap" (top 3, with a concrete next step) and "Red flags" (only rendered when any
// exist), as compact cards in the trace style (docs/08-BRAND-UI.md §6.5).
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import type { PartialAnalysis } from '@/lib/client/partial';
import { ResultCard } from './result-card';
import { QUIET_TEXT, TONE_CLASSES } from './tone';

export function GapList({ gaps, streaming }: { gaps: PartialAnalysis['gaps']; streaming: boolean }) {
  const g = strings.results.gaps;
  return (
    <ResultCard title={g.title} className="h-full">
      {gaps.length === 0 ? (
        streaming ? (
          <div className="grid gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{g.empty}</p>
        )
      ) : (
        <ol className="grid gap-3">
          {gaps.map((gap, i) => (
            <li key={i} className="flex animate-trace-in gap-3 text-sm">
              <span aria-hidden="true" className={cn('pt-px font-mono text-xs tabular-nums', QUIET_TEXT)}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="min-w-0 leading-relaxed break-words">
                <span className="font-medium">{gap.skill}</span>
                {gap.howToClose ? <span className="text-muted-foreground">: {gap.howToClose}</span> : null}
              </p>
            </li>
          ))}
        </ol>
      )}
    </ResultCard>
  );
}

export function RedFlagList({ redFlags }: { redFlags: string[] }) {
  if (redFlags.length === 0) return null;
  const r = strings.results.redFlags;
  const bad = TONE_CLASSES.bad;
  return (
    <ResultCard
      title={r.title}
      icon="⚑"
      className={cn('h-full', bad.surface)}
      // Both variants, so the quiet dark-mode label color doesn't win over the miss tone.
      titleClassName="text-miss dark:text-miss"
    >
      <ul className="grid gap-2.5">
        {redFlags.map((flag, i) => (
          <li key={i} className="flex animate-trace-in gap-2.5 text-sm">
            <span aria-hidden="true" className={cn('font-mono leading-relaxed', bad.text)}>
              ⚑
            </span>
            <span className="min-w-0 leading-relaxed break-words">
              <span className="sr-only">{r.flagAriaLabel}: </span>
              {flag}
            </span>
          </li>
        ))}
      </ul>
    </ResultCard>
  );
}
