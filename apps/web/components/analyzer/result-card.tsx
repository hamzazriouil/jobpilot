// Shared frame for every results block: a Card with a small mono uppercase heading (h3; the
// results section owns the h2). Tighter padding on phones so content gets the width.
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function ResultCard({
  title,
  action,
  className,
  children,
}: {
  title: string;
  /** Optional control on the right of the heading (e.g. the draft tabs on desktop). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn('gap-4 py-5', className)}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
        <h3 className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </CardHeader>
      <CardContent className="px-4 sm:px-6">{children}</CardContent>
    </Card>
  );
}
