// A verbatim quote from the CV or the job post (docs/03-UI-UX.md §4.2): mono, left border in the
// status color, plus a "from: …" source label. This is the product's trust mechanism.
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import { TONE_CLASSES, type Tone } from './tone';

export function EvidenceQuote({
  quote,
  source,
  tone = 'neutral',
  className,
}: {
  quote: string;
  /** Already-localized source label, e.g. "project" or "job post". */
  source?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <figure className={cn('min-w-0 border-l-2 pl-3', TONE_CLASSES[tone].border, className)}>
      <blockquote className="font-mono text-xs leading-relaxed break-words text-foreground/90">
        “{quote}”
      </blockquote>
      {source ? (
        <figcaption className="mt-1 font-mono text-[11px] text-muted-foreground">
          {strings.results.from} {source}
        </figcaption>
      ) : null}
    </figure>
  );
}
