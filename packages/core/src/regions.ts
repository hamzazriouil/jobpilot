// Country → region expansion (docs/02-DATABASE.md §5, "Region codes").
// `profiles.work_auth_regions` stores the EXPANDED set (e.g. MA → MA, AFRICA, MENA, EMEA) so
// `match_jobs` can use a plain array overlap (`&&`) against `jobs.allowed_regions`.
//
// Region codes are uppercase and share one namespace with ISO-2 country codes.
// ⚠️ 'NA' (North America) collides with Namibia's ISO code 'NA'. Kept because the spec uses it;
// renaming to e.g. 'NORTH_AMERICA' would need the ingest classifier to follow.

export const REGION = Object.freeze({
  EU: 'EU',
  EEA: 'EEA',
  UK: 'UK', // job posts say "UK"; the ISO code is GB, so GB expands to include 'UK'
  EUROPE: 'EUROPE',
  EMEA: 'EMEA',
  AFRICA: 'AFRICA',
  MENA: 'MENA',
  GCC: 'GCC',
  NORTH_AMERICA: 'NA',
  LATAM: 'LATAM',
  AMERICAS: 'AMERICAS',
  APAC: 'APAC',
  ASIA: 'ASIA',
  SOUTH_ASIA: 'SOUTH_ASIA',
} as const);
export type RegionCode = (typeof REGION)[keyof typeof REGION];

const R = REGION;

// ── country groups ──────────────────────────────────────────────────────────
const EU27 = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const;
const EEA_NON_EU = ['IS', 'LI', 'NO'] as const;
// Parts of the EU with their own ISO code (Åland; outermost regions).
const EU_TERRITORIES_EUROPE = ['AX'] as const;
const EU_TERRITORIES_AFRICA = ['RE', 'YT'] as const;
const EU_TERRITORIES_AMERICAS = ['GF', 'GP', 'MQ', 'MF'] as const;
// UK Crown dependencies / Gibraltar: not the UK legally, but close enough to treat like it for routing.
const UK_ADJACENT = ['GI', 'JE', 'GG', 'IM'] as const;
const EUROPE_OTHER = [
  'AD', 'MC', 'SM', 'VA', 'FO', 'AL', 'BA', 'ME', 'MK', 'RS', 'XK', 'MD', 'UA', 'BY', 'RU',
  'GE', 'AM', 'AZ', 'TR',
] as const;
const NORTH_AFRICA = ['MA', 'DZ', 'TN', 'LY', 'EG', 'SD', 'MR'] as const;
const GULF = ['SA', 'AE', 'QA', 'KW', 'BH', 'OM'] as const;
const MIDDLE_EAST_OTHER = ['JO', 'LB', 'IQ', 'SY', 'YE', 'PS', 'IL', 'IR'] as const;
const SUB_SAHARAN_AFRICA = [
  'NG', 'GH', 'KE', 'ZA', 'ET', 'UG', 'TZ', 'RW', 'SN', 'CI', 'CM', 'ZW', 'ZM', 'MZ', 'AO',
  'BJ', 'TG', 'BF', 'ML', 'NE', 'MG', 'MU', 'BW', 'NA', 'CD', 'CG', 'GA', 'GN', 'SL', 'LR',
  'GM', 'CV', 'MW', 'LS', 'SZ', 'SO', 'DJ', 'ER', 'SS', 'TD', 'CF', 'GQ', 'BI', 'KM', 'SC',
  'ST', 'GW',
] as const;
const NORTH_AMERICA = ['US', 'CA'] as const;
// Mexico is deliberately NOT in 'NA': in remote job posts "North America" means US + Canada.
const LATAM = [
  'MX', 'GT', 'BZ', 'HN', 'SV', 'NI', 'CR', 'PA', 'CU', 'DO', 'HT', 'PR', 'CO', 'VE', 'EC',
  'PE', 'BO', 'PY', 'UY', 'AR', 'CL', 'BR', 'GY', 'SR',
] as const;
const CARIBBEAN_OTHER = ['JM', 'TT', 'BS', 'BB', 'LC', 'VC', 'GD', 'AG', 'DM', 'KN'] as const;
const SOUTH_ASIA = ['IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV', 'AF'] as const;
const EAST_SE_ASIA = [
  'CN', 'HK', 'MO', 'TW', 'JP', 'KR', 'MN', 'SG', 'MY', 'ID', 'PH', 'VN', 'TH', 'KH', 'LA',
  'MM', 'BN', 'TL',
] as const;
const CENTRAL_ASIA = ['KZ', 'UZ', 'KG', 'TJ', 'TM'] as const;
const OCEANIA = ['AU', 'NZ', 'FJ', 'PG'] as const;

// ── the table: country → regions (country itself excluded; it's always first) ──
const GROUPS: ReadonlyArray<readonly [readonly string[], readonly RegionCode[]]> = [
  [EU27, [R.EU, R.EEA, R.EUROPE, R.EMEA]],
  [EU_TERRITORIES_EUROPE, [R.EU, R.EEA, R.EUROPE, R.EMEA]],
  [EU_TERRITORIES_AFRICA, [R.EU, R.EEA, R.AFRICA, R.EMEA]],
  [EU_TERRITORIES_AMERICAS, [R.EU, R.EEA, R.AMERICAS]],
  [EEA_NON_EU, [R.EEA, R.EUROPE, R.EMEA]],
  [['GB'], [R.UK, R.EUROPE, R.EMEA]],
  [UK_ADJACENT, [R.EUROPE, R.EMEA]],
  [['CH'], [R.EUROPE, R.EMEA]],
  [EUROPE_OTHER, [R.EUROPE, R.EMEA]],
  [NORTH_AFRICA, [R.AFRICA, R.MENA, R.EMEA]],
  [GULF, [R.MENA, R.GCC, R.EMEA]],
  [MIDDLE_EAST_OTHER, [R.MENA, R.EMEA]],
  [SUB_SAHARAN_AFRICA, [R.AFRICA, R.EMEA]],
  [NORTH_AMERICA, [R.NORTH_AMERICA, R.AMERICAS]],
  [LATAM, [R.LATAM, R.AMERICAS]],
  [CARIBBEAN_OTHER, [R.AMERICAS]],
  [SOUTH_ASIA, [R.SOUTH_ASIA, R.ASIA, R.APAC]],
  [EAST_SE_ASIA, [R.ASIA, R.APAC]],
  [CENTRAL_ASIA, [R.ASIA, R.EMEA]],
  [OCEANIA, [R.APAC]],
];

function buildTable(): Readonly<Record<string, readonly RegionCode[]>> {
  const table: Record<string, readonly RegionCode[]> = {};
  for (const [countries, regions] of GROUPS) {
    for (const cc of countries) {
      if (table[cc]) throw new Error(`regions.ts: ${cc} listed twice`);
      table[cc] = Object.freeze([...regions]);
    }
  }
  return Object.freeze(table);
}

/** Country (ISO-2) → the regions it belongs to, excluding the country itself. */
export const COUNTRY_REGIONS = buildTable();

/** Accepts "ma", " MA ", and the common alias "UK" (→ "GB"). Returns null if not 2 letters. */
export function normalizeCountryCode(countryCode: string): string | null {
  const cc = countryCode.trim().toUpperCase();
  if (cc === 'UK') return 'GB';
  return /^[A-Z]{2}$/.test(cc) ? cc : null;
}

/**
 * Expand a country into itself + its regions, e.g.
 * MA → ['MA','AFRICA','MENA','EMEA'], FR → ['FR','EU','EEA','EUROPE','EMEA'], US → ['US','NA','AMERICAS'].
 * Unknown but well-formed codes → [cc]. Malformed input → [].
 */
export function expandRegions(countryCode: string): string[] {
  const cc = normalizeCountryCode(countryCode);
  if (!cc) return [];
  return [cc, ...(COUNTRY_REGIONS[cc] ?? [])];
}

/**
 * Countries where the free Gemini tier must not be used (Architecture §4.1–4.2):
 * EU + EEA + UK + Switzerland, plus EU territories with their own ISO code and the UK
 * crown dependencies / Gibraltar (conservative: a false positive only means using Workers AI).
 */
export const EEA_UK_CH: Set<string> = new Set<string>([
  ...EU27,
  ...EU_TERRITORIES_EUROPE,
  ...EU_TERRITORIES_AFRICA,
  ...EU_TERRITORIES_AMERICAS,
  ...EEA_NON_EU,
  'GB',
  ...UK_ADJACENT,
  'CH',
]);

export function isEeaUkCh(countryCode: string | null | undefined): boolean {
  if (!countryCode) return false;
  const cc = normalizeCountryCode(countryCode);
  return cc !== null && EEA_UK_CH.has(cc);
}
