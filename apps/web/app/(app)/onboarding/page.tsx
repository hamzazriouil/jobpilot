import { headers } from 'next/headers';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';
import { countryOptions, defaultCountryFrom } from '@/lib/countries';
import { strings } from '@/lib/strings';

// /onboarding (docs/03-UI-UX.md §4.4). The (app) layout guarantees a signed-in user. Users who
// already finished it can come back here to redo their profile (Settings arrives on Day 4).

export const metadata = { title: strings.onboarding.title };

export default async function OnboardingPage() {
  const countries = countryOptions();
  const defaultCountry = defaultCountryFrom((await headers()).get('cf-ipcountry'), countries);
  return <OnboardingFlow countries={countries} defaultCountry={defaultCountry} />;
}
