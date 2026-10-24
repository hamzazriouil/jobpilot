// shadcn/ui Textarea (new-york), hand-copied because the shadcn CLI hung on this machine.
// Signal brand: sits on bg-background in dark (bg-elevated in light), strong border, 8px radius,
// focus ring from the `ring` token (signal lime in dark, a darker lime in light for contrast).
// 16px text on phones so iOS doesn't zoom on focus, 14px from `sm`.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-border-strong bg-elevated px-3 py-2.5 text-base text-foreground transition-[color,border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-miss aria-invalid:ring-miss/20 sm:text-sm dark:bg-background',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
