import { headers } from 'next/headers';
import { COUNTRY_REGIONS, normalizeCountryCode } from '@jobpilot/core/regions';
import { Analyzer, type CountryOption } from '@/components/analyzer/analyzer';
import { LandingSections } from '@/components/landing-sections';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { strings } from '@/lib/strings';

// Landing + analyzer + results (docs/03-UI-UX.md §4.1–4.2). The page itself is a server
// component; everything interactive lives in <Analyzer>.

/** Used when Cloudflare's geo header is missing (local dev) or not a country we know. */
const FALLBACK_COUNTRY = 'MA';

/** Country names are resolved here on the server so client and server HTML always match. */
function countryOptions(): CountryOption[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    names = null;
  }
  return Object.keys(COUNTRY_REGIONS)
    .map((code) => {
      let name = code;
      try {
        name = names?.of(code) ?? code;
      } catch {
        // unknown to this ICU build: keep the code
      }
      return { code, name };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export default async function HomePage() {
  const s = strings;
  const countries = countryOptions();
  // Pre-select the visitor's country from Cloudflare's geo header; the user can change it.
  const geo = normalizeCountryCode((await headers()).get('cf-ipcountry') ?? '');
  const defaultCountry = geo && countries.some((c) => c.code === geo) ? geo : FALLBACK_COUNTRY;

  return (
    <div className="flex min-h-dvh flex-col text-base">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:py-16">
        <section className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{s.hero.title}</h1>
          <p className="mt-4 text-pretty text-muted-foreground">{s.hero.subtitle}</p>
        </section>

        <Analyzer countries={countries} defaultCountry={defaultCountry} />

        <LandingSections />
      </main>

      <SiteFooter />
    </div>
  );
}
