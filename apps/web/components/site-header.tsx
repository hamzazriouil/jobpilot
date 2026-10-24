// Sticky site header (docs/08-BRAND-UI.md §6.1): mark + wordmark, nav, theme toggle, primary CTA.
// On phones (<640px) the text nav is hidden; mark, toggle and CTA stay.
import { BrandMark } from '@/components/brand-mark';
import { buttonVariants } from '@/components/ui/button';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

const focusRing = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function SiteHeader() {
  const s = strings.header;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="/" aria-label={s.homeAriaLabel} className={cn('flex min-h-10 items-center gap-2.5 rounded-md', focusRing)}>
          <BrandMark />
          <span className="text-lg font-semibold tracking-[-0.02em] sm:text-xl">{s.brand}</span>
        </a>

        <div className="flex items-center gap-1 sm:gap-2">
          <nav aria-label={s.navAriaLabel} className="hidden sm:block">
            <ul className="flex items-center gap-1 md:gap-3">
              {strings.nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={cn(
                      'inline-flex min-h-10 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground',
                      focusRing,
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
          <a href={s.ctaHref} className={cn(buttonVariants({ variant: 'default' }), 'px-3.5 sm:px-4')}>
            {s.cta}
          </a>
        </div>
      </div>
    </header>
  );
}
