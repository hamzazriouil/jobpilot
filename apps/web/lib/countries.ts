import { COUNTRY_REGIONS, normalizeCountryCode } from '@jobpilot/core/regions';
import type { CountryOption } from '@/components/analyzer/analyzer';

// Country picker options shared by the analyzer (/) and onboarding.

/** Used when Cloudflare's geo header is missing (local dev) or not a country we know. */
const FALLBACK_COUNTRY = 'MA';

/** Country names are resolved here on the server so client and server HTML always match. */
export function countryOptions(): CountryOption[] {
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

/** The visitor's country from Cloudflare's geo header when we know it, else FALLBACK_COUNTRY. */
export function defaultCountryFrom(cfCountry: string | null, countries: CountryOption[]): string {
  const geo = normalizeCountryCode(cfCountry ?? '');
  return geo && countries.some((c) => c.code === geo) ? geo : FALLBACK_COUNTRY;
}
