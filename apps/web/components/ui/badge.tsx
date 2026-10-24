// shadcn/ui Badge (new-york), hand-copied because the shadcn CLI hung on this machine.
// Signal brand: pills are fully rounded (docs/08-BRAND-UI.md §5); default = signal fill.
// TODO: re-run `pnpm dlx shadcn@latest add badge --overwrite` to restore `asChild` (needs radix-ui).
import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-signal text-signal-foreground',
        secondary: 'border-border bg-elevated text-foreground',
        destructive: 'border-miss/30 bg-miss/10 text-miss',
        outline: 'border-border-strong text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
