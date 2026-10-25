// Jobs core (docs/09-PHASE1-CONTRACT.md §3): built by W13 Ingest, reused by W12 Jobs.
export { jobContentHash } from './hash';
export { classifyLocationRules, verdictFromCountryNames, type LocationVerdict } from './location';
export { isTechRole } from './tech';
export { htmlToText } from './html';
export { countryCodeFromName, normalizePlaceName, ISO_COUNTRY_CODES } from './countries';
