import { describe, expect, it } from 'vitest';
import { classifyLocationRules, verdictFromCountryNames } from './location';
import { countryCodeFromName } from './countries';

const loc = (locationRaw: string | null, description = '') => classifyLocationRules({ locationRaw, description });
const regions = (locationRaw: string | null, description = '') => {
  const v = loc(locationRaw, description);
  expect(v.eligibilityType, `${locationRaw} | ${description}`).toBe('regions');
  return [...v.allowedRegions].sort();
};

describe('classifyLocationRules: worldwide', () => {
  it.each(['Worldwide', 'Anywhere', 'Remote - Anywhere', 'Global', 'Anywhere in the World', '🌎 Remote', 'Work from anywhere'])(
    '%s → worldwide',
    (raw) => {
      const v = loc(raw);
      expect(v.eligibilityType).toBe('worldwide');
      expect(v.allowedRegions).toEqual([]);
      expect(v.quote).toBe(raw);
    },
  );

  it('a preference is not a restriction', () => {
    expect(loc('Worldwide (US preferred)').eligibilityType).toBe('worldwide');
    expect(loc('Anywhere, EU timezones preferred').eligibilityType).toBe('worldwide');
  });

  it('worldwide from the description when the location field is empty', () => {
    const v = loc(null, 'We are a distributed team. You can work from anywhere in the world as long as you have internet.');
    expect(v.eligibilityType).toBe('worldwide');
    expect(v.quote).toContain('work from anywhere in the world');
  });
});

describe('classifyLocationRules: countries and regions (Remotive / Remote OK style)', () => {
  it('country names and aliases', () => {
    expect(regions('USA')).toEqual(['US']);
    expect(regions('United States')).toEqual(['US']);
    expect(regions('Remote - US')).toEqual(['US']);
    expect(regions('Your Remote US Home Office')).toEqual(['US']);
    expect(regions('U.S. only')).toEqual(['US']);
    expect(regions('UK')).toEqual(['GB']);
    expect(regions('Brazil')).toEqual(['BR']);
    expect(regions('South Korea')).toEqual(['KR']);
  });

  it('lists of countries, with a time-zone phrase that does not add a country', () => {
    expect(regions('USA, Canada, USA timezones')).toEqual(['CA', 'US']);
    expect(regions('Europe, USA, Canada, APAC')).toEqual(['APAC', 'CA', 'EUROPE', 'US']);
    expect(regions('Europe, USA, UK, Canada, Australia, Ireland, Switzerland, Singapore, Mexico, Iceland, Norway')).toEqual(
      ['AU', 'CA', 'CH', 'EUROPE', 'GB', 'IE', 'IS', 'MX', 'NO', 'SG', 'US'].sort(),
    );
  });

  it('region words', () => {
    expect(regions('EU')).toEqual(['EU']);
    expect(regions('EEA')).toEqual(['EEA']);
    expect(regions('Europe')).toEqual(['EUROPE']);
    expect(regions('EMEA')).toEqual(['EMEA']);
    expect(regions('LATAM')).toEqual(['LATAM']);
    expect(regions('Latin America')).toEqual(['LATAM']);
    expect(regions('APAC')).toEqual(['APAC']);
    expect(regions('Africa')).toEqual(['AFRICA']);
    expect(regions('MENA')).toEqual(['MENA']);
    expect(regions('North America')).toEqual(['NA']);
    expect(regions('Anywhere in Europe')).toEqual(['EUROPE']);
    expect(regions('Americas')).toEqual(['AMERICAS']);
    expect(regions('DACH')).toEqual(['AT', 'CH', 'DE']);
  });

  it('longest match wins: South Africa is a country, New Mexico is a US state', () => {
    expect(regions('South Africa')).toEqual(['ZA']);
    expect(regions('Albuquerque, New Mexico')).toEqual(['US']);
    expect(regions('Sydney, New South Wales')).toEqual(['AU']);
    expect(regions('Port Moresby, Papua New Guinea')).toEqual(['PG']);
  });

  it('US states, "City, ST" and Canadian provinces', () => {
    expect(regions('Seattle, Washington')).toEqual(['US']);
    expect(regions('Kansas ')).toEqual(['US']);
    expect(regions('SIHO - Columbus, IN')).toEqual(['US']);
    expect(regions('Vancouver, BC, Canada')).toEqual(['CA']);
  });

  it('accents and ISO codes', () => {
    expect(regions('Ciudad de México, Mexico')).toEqual(['MX']);
    expect(regions("Côte d'Ivoire")).toEqual(['CI']);
    expect(regions('DE, FR, NL')).toEqual(['DE', 'FR', 'NL']);
    expect(regions('Remote, DE')).toEqual(['DE']);
    expect(regions('Boston, MA')).toEqual(['US']);
  });

  it('the narrower of two agreeing sets wins', () => {
    const v = loc('Europe', 'Candidates must be based in Germany or Poland.');
    expect(v.allowedRegions.sort()).toEqual(['DE', 'PL']);
    expect(v.quote).toContain('must be based in Germany or Poland');
    // same set: the location field is the quote
    expect(loc('USA', 'You must be authorized to work in the United States.').quote).toBe('USA');
  });
});

describe('classifyLocationRules: description restrictions', () => {
  it('reads restriction sentences when the location field says nothing', () => {
    expect(regions('Remote', 'This is a remote role. Applicants must be located in the United States or Canada.')).toEqual(['CA', 'US']);
    expect(regions(null, 'We are hiring a backend engineer (US only).')).toEqual(['US']);
    expect(regions('', 'Talent Database - Sr. AI Engineer - India Only\nAbout us...')).toEqual(['IN']);
    expect(regions(null, 'This position is open to candidates based in the EU.')).toEqual(['EU']);
    expect(regions(null, 'You must be legally authorized to work in the UK.')).toEqual(['GB']);
  });

  it('ignores places that are not restrictions', () => {
    expect(loc(null, 'We have offices in London, Berlin and New York.').eligibilityType).toBe('unclear');
    expect(loc(null, 'Our customers are in the US and Europe.').eligibilityType).toBe('unclear');
  });
});

describe('classifyLocationRules: time zones (conservative)', () => {
  it('maps offset ranges to broad regions', () => {
    expect(regions('UTC±3')).toEqual(['AMERICAS', 'EMEA']);
    expect(regions('CET ±2h')).toEqual(['EMEA']);
    expect(regions('UTC-5 to UTC-8')).toEqual(['AMERICAS']);
    expect(regions('Remote (GMT+1 to GMT+3)')).toEqual(['EMEA']);
    expect(regions('PST to EST')).toEqual(['AMERICAS']);
    expect(regions('US time zones')).toEqual(['AMERICAS']);
    expect(regions('UTC+5 to UTC+9')).toEqual(['APAC']);
  });

  it('a very wide range is unclear', () => {
    expect(loc('UTC-8 to UTC+5').eligibilityType).toBe('unclear');
  });

  it('two-letter zones are not trusted alone (PT is also Portugal)', () => {
    expect(regions('Lisbon, PT')).toEqual(['PT']);
  });
});

describe('classifyLocationRules: unclear', () => {
  it.each([
    [null, ''],
    ['', ''],
    ['Remote', ''],
    ['Boston', ''],
    ['Copenhagen', ''],
    ['US, UK, Canada, Australia + 35 other countries', ''],
    ['Worldwide, except US', ''],
    ['Global - EMEA', ''],
  ])('%s → unclear', (raw, description) => {
    const v = loc(raw, description);
    expect(v.eligibilityType).toBe('unclear');
    expect(v.allowedRegions).toEqual([]);
    expect(v.quote).toBeNull();
  });

  it('contradictions are unclear', () => {
    expect(loc('Worldwide', 'Candidates must be based in the United States.').eligibilityType).toBe('unclear');
    expect(loc('USA', 'Applicants must reside in Germany.').eligibilityType).toBe('unclear');
  });
});

describe('verdictFromCountryNames (Himalayas locationRestrictions)', () => {
  it('empty list = no restriction', () => {
    expect(verdictFromCountryNames([])).toEqual({ eligibilityType: 'worldwide', allowedRegions: [], quote: null });
  });

  it('maps ISO short names, including the odd ones', () => {
    const v = verdictFromCountryNames(['United States', 'Congo, The Democratic Republic of the', 'Palestine, State of', 'Holy See (Vatican City State)', 'Åland Islands', 'Russian Federation', 'Curaçao']);
    expect(v.eligibilityType).toBe('regions');
    expect(v.allowedRegions).toEqual(['US', 'CD', 'PS', 'VA', 'AX', 'RU', 'CW']);
    expect(v.quote).toMatch(/^United States, Congo/);
  });

  it('unknown names only → unclear', () => {
    expect(verdictFromCountryNames(['Atlantis']).eligibilityType).toBe('unclear');
  });

  it('countryCodeFromName is accent- and case-insensitive', () => {
    expect(countryCodeFromName('cote d ivoire')).toBe('CI');
    expect(countryCodeFromName('TÜRKIYE')).toBe('TR');
    expect(countryCodeFromName('Bosnia & Herzegovina')).toBe('BA');
    expect(countryCodeFromName('Nowhere')).toBeNull();
  });
});
