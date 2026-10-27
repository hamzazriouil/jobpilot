'use client';

// App navigation (docs/03-UI-UX.md §3): links in the header from `sm` up, a bottom tab bar on phones.
// Client component only to mark the current page.
import { usePathname } from 'next/navigation';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

const focusRing = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function isActive(pathname: string, href: string): boolean {
  if (href === '/jobs/new') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ variant }: { variant: 'top' | 'bottom' }) {
  const pathname = usePathname() ?? '';
  const s = strings.app;

  if (variant === 'top') {
    return (
      <nav aria-label={s.navAriaLabel} className="hidden sm:block">
        <ul className="flex items-center gap-1 md:gap-2">
          {s.nav.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-10 items-center rounded-md px-2 text-sm whitespace-nowrap transition-colors hover:text-foreground',
                    active ? 'text-foreground' : 'text-muted-foreground',
                    focusRing,
                  )}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav
      aria-label={s.navAriaLabel}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="grid grid-cols-5">
        {s.nav.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 items-center justify-center px-1 text-center text-xs leading-tight',
                  active ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  focusRing,
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
