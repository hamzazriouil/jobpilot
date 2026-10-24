// "Close the gap" (top 3, with a concrete next step) and "Red flags" (only rendered when any exist).
import { Flag } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from '@/lib/strings';
import type { PartialAnalysis } from '@/lib/client/partial';
import { ResultCard } from './result-card';
import { TONE_CLASSES } from './tone';

export function GapList({ gaps, streaming }: { gaps: PartialAnalysis['gaps']; streaming: boolean }) {
  const g = strings.results.gaps;
  return (
    <ResultCard title={g.title}>
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
            <li key={i} className="flex gap-3 text-sm">
              <span aria-hidden="true" className="font-mono text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              <p className="min-w-0 break-words">
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
  return (
    <ResultCard title={r.title}>
      <ul className="grid gap-2">
        {redFlags.map((flag, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <Flag aria-label={r.flagAriaLabel} className={`mt-0.5 size-4 shrink-0 ${TONE_CLASSES.warn.icon}`} />
            <span className="min-w-0 break-words">{flag}</span>
          </li>
        ))}
      </ul>
    </ResultCard>
  );
}
