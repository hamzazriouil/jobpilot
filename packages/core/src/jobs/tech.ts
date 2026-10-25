// Dev/AI category filter for the public feed (docs/09-PHASE1-CONTRACT.md §3, Architecture §5.4).
// The title decides; tags only help when the title is a generic one ("Staff Engineer",
// "Member of Technical Staff"). Source tags are noisy (Remote OK tags an accounting role "golang"),
// so tags alone never make a role technical.
//
// Order: non-tech role noun → no; strong tech title → yes; non-software engineering → no;
// non-tech domain word → no; generic engineer/architect title → yes if the tags agree.

// Role nouns that are never dev/AI, whatever else the title says ("Technical Recruiter", "AI Trainer").
const NOT_TECH_ROLE =
  /\b(?:recruit\w*|talent (?:acquisition|partner|sourcer)|sourcer|account (?:executive|manager|director)|sales (?:representative|rep|executive|manager|director|associate|development|lead|specialist)|sdr|bdr|business develop\w*|(?:project|program|product|delivery|customer excellence) manager|scrum master|(?:course|curriculum|instructional) (?:developer|designer)|skills coach|licensing specialist|copywriter|writer|editor|nurse|nursing|physician|therapist|phlebotom\w*|pharmacist|accountant|bookkeep\w*|auditor|controller|paralegal|lawyer|attorney|counsel|teacher|tutor|instructor|trainer|driver|investigator|underwriter|receptionist|(?:executive|virtual|administrative) assistant|chef|cook|customer (?:success|service|support|experience)|support (?:specialist|agent|representative)|marketing (?:manager|specialist|coordinator|director|lead|associate)|marketer)\b/i;

const STRONG_TECH_TITLE =
  /\b(?:software(?!\s+(?:as a service|licens\w*|publisher|sales|asset|procurement))|developer|programmer|full[- ]?stack|front[- ]?end|back[- ]?end|web (?:developer|engineer)|mobile (?:engineer|developer|app\w*)|ios|android|flutter|react(?: native)?|angular|vue(?:\.js)?|node(?:\.js)?|python|golang|rust|java|kotlin|swift|typescript|javascript|ruby|rails|php|laravel|django|scala|elixir|devops|devsecops|sre|site reliability|platform engineer\w*|infrastructure engineer\w*|cloud (?:engineer|architect)|kubernetes|data engineer\w*|analytics engineer|data scientist|data science|machine learning|deep learning|computer vision|nlp|mlops|(?:ai|ml|ai\/ml|ml\/ai|llm|genai|generative ai)\s+(?:engineer\w*|developer|researcher|scientist|architect|ops|infrastructure|platform)|applied scientist|research (?:scientist|engineer)|prompt engineer|security engineer|appsec|application security|penetration tester|pentester|qa (?:engineer|automation|analyst)|test automation|sdet|automation engineer|embedded (?:software|engineer|developer)|firmware|game (?:developer|programmer|engineer)|unity developer|blockchain|smart contract|solidity|web3|database (?:engineer|administrator|developer)|dba|engineering manager|tech(?:nical)? lead|cto|chief technology officer|vp,? (?:of )?engineering|head of engineering|software architect|technical architect|member of technical staff|developer (?:advocate|relations|experience))\b/i;

// Engineering disciplines that are not software.
const NON_SOFTWARE_ENGINEER =
  /\b(?:mechanical|civil|structural|electrical|chemical|process|manufacturing|industrial|instrumentation|controls?|hvac|mep|piping|geotechnical|environmental|biomedical|petroleum|mining|aerospace|automotive|rf|hardware|field|service|sales|solutions?|pre-?sales|support|customer|gtm|marketing|audio|sound|recording|validation|quality|facilities|maintenance|construction|design|packaging|commissioning)\s+(?:engineer|engineering)\b/i;

// Departments that make a generic title non-technical ("Marketing Operations Engineer").
const NON_TECH_DOMAIN =
  /\b(?:sales|marketing|finance|financial|accounting|legal|medical|clinical|healthcare|human resources|hr|customer|insurance|real estate|payroll|tax|revenue)\b/i;

// Generic titles that are technical only with the right context.
const GENERIC_ENGINEER = /\b(?:engineer|engineering|architect|technical staff)\b/i;

const TECH_TAGS = new Set([
  'software development', 'software engineering', 'software engineer', 'developer', 'programming',
  'backend', 'frontend', 'front end', 'back end', 'full stack', 'fullstack', 'devops', 'sre',
  'machine learning', 'ml', 'ai', 'artificial intelligence', 'data science', 'data engineering',
  'python', 'javascript', 'typescript', 'react', 'node', 'nodejs', 'golang', 'go', 'rust', 'java',
  'kotlin', 'swift', 'ruby', 'rails', 'php', 'scala', 'elixir', 'c++', 'c#', '.net', 'kubernetes',
  'aws', 'gcp', 'azure', 'cloud', 'llm', 'nlp', 'web dev', 'mobile', 'ios', 'android', 'qa',
  'security', 'blockchain', 'embedded', 'ai engineer', 'data engineer', 'engineer', 'dev',
]);

function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Dev/AI category filter for feed jobs (title + tags rules). */
export function isTechRole(input: { title: string; tags: string[] }): boolean {
  const title = input.title.replace(/\s+/g, ' ').trim();
  if (!title) return false;
  if (NOT_TECH_ROLE.test(title)) return false;
  if (STRONG_TECH_TITLE.test(title)) return true;
  if (NON_SOFTWARE_ENGINEER.test(title)) return false;
  if (NON_TECH_DOMAIN.test(title)) return false;
  if (GENERIC_ENGINEER.test(title)) {
    // "Senior Engineer", "Founding Engineer", "Staff Engineer" are software roles on remote job
    // boards. When the source gives tags, at least one must be technical.
    const tags = input.tags.map(normalizeTag);
    return tags.length === 0 || tags.some((t) => TECH_TAGS.has(t));
  }
  return false;
}
