// shadcn/ui Skeleton (new-york), hand-copied because the shadcn CLI hung on this machine.
// `motion-reduce` keeps a static placeholder for users who prefer reduced motion.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('bg-accent animate-pulse rounded-md motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export { Skeleton };
