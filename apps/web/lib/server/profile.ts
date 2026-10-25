import { COUNTRY_REGIONS, expandRegions } from '@jobpilot/core/regions';

// profiles.work_auth_regions (docs/02-DATABASE.md §5): the residence country expanded into its
// regions, plus where else the user says they may legally work. An extra *country* is expanded too
// (a French passport means EU jobs are open); an extra *region* code is kept as is.

export function workAuthRegions(country: string, extras: string[]): string[] {
  const out = new Set(expandRegions(country));
  for (const code of extras) {
    if (code.length === 2 && COUNTRY_REGIONS[code]) for (const r of expandRegions(code)) out.add(r);
    else out.add(code);
  }
  return [...out];
}
