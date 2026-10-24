// shadcn/ui Skeleton (new-york), hand-copied because the shadcn CLI hung on this machine.
// Signal brand: a quiet opacity pulse on the elevated surface (no shimmer); static under
// prefers-reduced-motion.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('bg-elevated animate-pulse rounded-md motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export { Skeleton };
