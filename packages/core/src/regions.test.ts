import { describe, expect, it } from 'vitest';
import { COUNTRY_REGIONS, EEA_UK_CH, expandRegions, isEeaUkCh } from './regions';

describe('expandRegions', () => {
  it('expands the documented examples exactly', () => {
    expect(expandRegions('MA')).toEqual(['MA', 'AFRICA', 'MENA', 'EMEA']);
    expect(expandRegions('FR')).toEqual(['FR', 'EU', 'EEA', 'EUROPE', 'EMEA']);
    expect(expandRegions('US')).toEqual(['US', 'NA', 'AMERICAS']);
  });

  it('distinguishes EU, EEA-only, UK and Switzerland', () => {
    expect(expandRegions('NO')).toEqual(['NO', 'EEA', 'EUROPE', 'EMEA']);
    expect(expandRegions('CH')).toEqual(['CH', 'EUROPE', 'EMEA']);
    expect(expandRegions('GB')).toEqual(['GB', 'UK', 'EUROPE', 'EMEA']);
    expect(expandRegions('uk')).toEqual(['GB', 'UK', 'EUROPE', 'EMEA']);
  });

  it('covers emerging markets and main hiring markets', () => {
    expect(expandRegions('NG')).toEqual(['NG', 'AFRICA', 'EMEA']);
    expect(expandRegions('EG')).toEqual(['EG', 'AFRICA', 'MENA', 'EMEA']);
    expect(expandRegions('AE')).toEqual(['AE', 'MENA', 'GCC', 'EMEA']);
    expect(expandRegions('IN')).toEqual(['IN', 'SOUTH_ASIA', 'ASIA', 'APAC']);
    expect(expandRegions('BR')).toEqual(['BR', 'LATAM', 'AMERICAS']);
    expect(expandRegions('CA')).toEqual(['CA', 'NA', 'AMERICAS']);
    for (const cc of ['DE', 'ES', 'IT', 'NL', 'PL', 'PT', 'IE', 'SE', 'TN', 'DZ', 'KE', 'ZA', 'GH', 'PK', 'BD', 'MX', 'AR', 'CO', 'CL', 'PH', 'UA', 'TR']) {
      expect(expandRegions(cc).length, cc).toBeGreaterThan(1);
    }
  });

  it('normalizes case/whitespace; unknown → [cc]; malformed → []', () => {
    expect(expandRegions(' ma ')).toEqual(['MA', 'AFRICA', 'MENA', 'EMEA']);
    expect(expandRegions('ZZ')).toEqual(['ZZ']);
    expect(expandRegions('MAR')).toEqual([]);
    expect(expandRegions('')).toEqual([]);
  });

  it('table keys are ISO-2 and every expansion is duplicate-free', () => {
    for (const [cc, regions] of Object.entries(COUNTRY_REGIONS)) {
      expect(cc).toMatch(/^[A-Z]{2}$/);
      const expanded = expandRegions(cc);
      expect(new Set(expanded).size, cc).toBe(expanded.length);
      expect(regions.length, cc).toBeGreaterThan(0);
    }
  });
});

describe('EEA_UK_CH / isEeaUkCh', () => {
  it('contains all 27 EU + 3 EEA states + GB + CH', () => {
    const core = [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
      'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
    ];
    for (const cc of core) expect(EEA_UK_CH.has(cc), cc).toBe(true);
    // every EU country in the table is in the set
    for (const [cc, regions] of Object.entries(COUNTRY_REGIONS)) {
      if (regions.includes('EU') || regions.includes('EEA')) expect(EEA_UK_CH.has(cc), cc).toBe(true);
    }
  });

  it('isEeaUkCh normalizes input and excludes everyone else', () => {
    expect(isEeaUkCh('fr')).toBe(true);
    expect(isEeaUkCh('UK')).toBe(true);
    expect(isEeaUkCh('CH')).toBe(true);
    expect(isEeaUkCh('MA')).toBe(false);
    expect(isEeaUkCh('US')).toBe(false);
    expect(isEeaUkCh('TR')).toBe(false);
    expect(isEeaUkCh(null)).toBe(false);
    expect(isEeaUkCh('')).toBe(false);
  });
});
