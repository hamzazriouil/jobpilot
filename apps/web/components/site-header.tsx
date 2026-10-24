import { BRAND_NAME } from '@jobpilot/core/brand';
import { strings } from '@/lib/strings';
import { ThemeToggle } from './theme-toggle';

export function SiteHeader() {
  const s = strings.header;
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <a href="/" aria-label={s.homeAriaLabel} className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-md bg-primary font-mono text-sm font-semibold text-primary-foreground"
          >
            {BRAND_NAME.charAt(0)}
          </span>
          <span className="font-semibold tracking-tight">{s.brand}</span>
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
