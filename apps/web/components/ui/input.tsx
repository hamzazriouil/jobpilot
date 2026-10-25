// shadcn/ui Input (new-york), hand-copied like the other primitives. Same tokens as Textarea:
// strong border, 8px radius, `ring` focus, 16px text on phones (no iOS zoom), 14px from `sm`.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-border-strong bg-elevated px-3 text-base text-foreground transition-[color,border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-miss aria-invalid:ring-miss/20 sm:text-sm dark:bg-background',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
