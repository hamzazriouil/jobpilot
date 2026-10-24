// A verbatim quote from the job post or the CV (docs/03-UI-UX.md §4.2, docs/08-BRAND-UI.md §6.5):
// mono, a left rule in the status color, plus a "from: …" source label. This is the product's
// trust mechanism. Long quotes wrap (break-words) so nothing scrolls sideways at 360px.
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
      <blockquote className="font-mono text-[13px] leading-relaxed break-words text-foreground/90">“{quote}”</blockquote>
      {source ? (
        // Muted, not quiet: the caption also sits on tinted (unclear / not eligible) cards.
        <figcaption className="mt-1 font-mono text-[11px] text-muted-foreground">
          {strings.results.from} {source}
        </figcaption>
      ) : null}
    </figure>
  );
}
