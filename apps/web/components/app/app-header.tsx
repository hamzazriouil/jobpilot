// Signed-in app header (docs/03-UI-UX.md §3 "App navigation"): mark, app nav (from `sm` up; phones
// get the bottom tab bar from the layout), theme toggle, account email and sign out.
// Server component: the sign-out button is a plain form POST to /auth/signout.
import { AppNav } from '@/components/app/app-nav';
import { BrandMark } from '@/components/brand-mark';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

const focusRing = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

export function AppHeader({ email }: { email: string | null }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <a href="/" aria-label={strings.header.homeAriaLabel} className={cn('flex min-h-10 items-center gap-2.5 rounded-md', focusRing)}>
            <BrandMark />
            <span className="hidden text-lg font-semibold tracking-[-0.02em] sm:inline">{strings.header.brand}</span>
          </a>
          <AppNav variant="top" />
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {email && <span className="hidden max-w-[22ch] truncate font-mono text-xs text-subtle md:inline">{email}</span>}
          <ThemeToggle />
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" className="px-2.5">
              {strings.auth.signOut}
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
