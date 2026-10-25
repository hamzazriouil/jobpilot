import { headers } from 'next/headers';
import Link from 'next/link';
import { Analyzer } from '@/components/analyzer/analyzer';
import { DemoTrace } from '@/components/landing/demo-trace';
import { SampleRunButton } from '@/components/landing/sample-run-button';
import { LandingSections } from '@/components/landing-sections';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { buttonVariants } from '@/components/ui/button';
import { countryOptions, defaultCountryFrom } from '@/lib/countries';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

// Landing + analyzer + results (docs/03-UI-UX.md §4.1–4.2, docs/08-BRAND-UI.md §6). The page itself
// is a server component; the interactive parts are <Analyzer>, <DemoTrace> and <SampleRunButton>.

export default async function HomePage() {
  const s = strings;
  const countries = countryOptions();
  // Pre-select the visitor's country from Cloudflare's geo header; the user can change it.
  const defaultCountry = defaultCountryFrom((await headers()).get('cf-ipcountry'), countries);

  return (
    <div className="flex min-h-dvh flex-col text-base">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section aria-labelledby="hero-title" className="flex flex-col items-center pt-14 text-center sm:pt-20 lg:pt-24">
          <Link
            href={s.hero.evalsHref}
            className="group inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-border-strong py-2 pr-3.5 pl-3 font-mono text-xs sm:gap-2.5 sm:pr-4 sm:text-[13px] text-muted-foreground transition-colors outline-none hover:border-subtle hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span aria-hidden="true" className="size-2 shrink-0 animate-live rounded-full bg-signal" />
            <span className="sm:hidden">{s.hero.evalsPillShort}</span>
            <span className="hidden sm:inline">{s.hero.evalsPill}</span>
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none">
              →
            </span>
          </Link>

          <h1
            id="hero-title"
            className="mt-6 max-w-[1120px] text-[44px] leading-[0.98] font-bold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[80px]"
          >
            <span className="block">{s.hero.title}</span>
            <span className="block text-subtle/80">{s.hero.titleMuted}</span>
          </h1>

          <p className="mt-6 max-w-[640px] text-[17px] leading-relaxed text-pretty text-muted-foreground sm:text-lg lg:mt-7 lg:text-[19px]">
            {s.hero.subtitle}
          </p>

          <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <SampleRunButton className="w-full sm:w-auto">{s.hero.ctaSample}</SampleRunButton>
            <a href="#analyzer" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-full sm:w-auto')}>
              {s.hero.ctaOwn}
            </a>
          </div>

          <p className="mt-5 font-mono text-xs text-pretty text-muted-foreground">{s.hero.trustLine}</p>
        </section>

        <DemoTrace />

        <div className="mt-16 sm:mt-24">
          <Analyzer countries={countries} defaultCountry={defaultCountry} />
        </div>

        <LandingSections />
      </main>

      <SiteFooter />
    </div>
  );
}
