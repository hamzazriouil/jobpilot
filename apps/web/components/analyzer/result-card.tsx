// Shared frames for the results (docs/08-BRAND-UI.md §5–6):
// - ResultCard: a compact 14px card with a mono uppercase heading (h3; the results section owns
//   the h2).
// - TerminalWindow: the "terminal" chrome (3 grey dots + mono title + right status) used by the
//   evidence trace; WindowDots is reused by the analyzer form's header row.
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LABEL_CLASS, QUIET_TEXT } from './tone';

export function ResultCard({
  title,
  icon,
  action,
  className,
  titleClassName,
  children,
}: {
  title: string;
  /** Optional decorative glyph before the title (rendered aria-hidden). */
  icon?: ReactNode;
  /** Optional control on the right of the heading. */
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('gap-3 py-4 sm:py-5', className)}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5">
        <h3 className={cn('flex items-center gap-2', LABEL_CLASS, titleClassName)}>
          {icon ? <span aria-hidden="true">{icon}</span> : null}
          {title}
        </h3>
        {action}
      </CardHeader>
      <CardContent className="px-4 sm:px-5">{children}</CardContent>
    </Card>
  );
}

export function WindowDots() {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
      <span className="size-2.5 rounded-full bg-border-strong" />
      <span className="size-2.5 rounded-full bg-border-strong" />
      <span className="size-2.5 rounded-full bg-border-strong" />
    </span>
  );
}

export function TerminalWindow({
  title,
  srTitle,
  status,
  className,
  bodyClassName,
  children,
}: {
  /** Mono window title, shown visually (e.g. "evidence-trace"). */
  title: string;
  /** Plain heading for screen readers (e.g. "Requirements"); the mono title is hidden from them. */
  srTitle: string;
  /** Right side of the title bar (decorative status or a count). */
  status?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm shadow-black/5 dark:shadow-none',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-3 border-b border-border px-4 py-3 font-mono text-xs sm:px-5',
          QUIET_TEXT,
        )}
      >
        <h3 className="flex min-w-0 items-center gap-3">
          <WindowDots />
          <span className="sr-only">{srTitle}</span>
          <span aria-hidden="true" className="truncate">
            {title}
          </span>
        </h3>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
      <div className={cn('relative', bodyClassName)}>{children}</div>
    </div>
  );
}
