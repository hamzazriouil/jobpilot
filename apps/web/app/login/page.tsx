import { LoginForm } from '@/components/auth/login-form';
import { BrandMark } from '@/components/brand-mark';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { safeNext } from '@/lib/auth/paths';
import { pageMetadata } from '@/lib/site';
import { strings } from '@/lib/strings';

// /login (docs/03-UI-UX.md §4.3). Signed-in visitors never see it: middleware.ts sends them to /feed.

export const metadata = {
  ...pageMetadata({ title: strings.auth.login.metaTitle, description: strings.auth.login.metaDescription, path: '/login' }),
  robots: { index: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = strings.auth.login;
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(one(params.next));
  const errorKey = one(params.error);
  const initialError = errorKey ? (s.errors[errorKey] ?? s.errors.generic!) : null;

  return (
    <div className="flex min-h-dvh flex-col text-base">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-start justify-center px-4 py-14 sm:px-6 sm:py-24">
        <div className="w-full max-w-[400px]">
          <div className="rounded-xl border bg-card p-6 sm:p-8">
            <BrandMark />
            <h1 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-balance">{s.title}</h1>
            <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{s.subtitle}</p>
            <div className="mt-7">
              <LoginForm next={next} initialError={initialError} />
            </div>
          </div>
          <p className="mt-5 text-center font-mono text-xs text-muted-foreground">{s.footnote}</p>
          <p className="mt-2 text-center text-xs text-pretty text-subtle">
            {s.legal.before}{' '}
            <a href="/terms" className="underline underline-offset-4 hover:text-foreground">
              {s.legal.terms}
            </a>{' '}
            {s.legal.and}{' '}
            <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              {s.legal.privacy}
            </a>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
