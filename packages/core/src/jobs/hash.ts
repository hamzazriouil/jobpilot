// Content hash for cross-source dedupe (docs/09-PHASE1-CONTRACT.md §3, Architecture §5.4).
// `jobs_public_hash_uq` is unique on it among public jobs, so the recipe must never change silently:
// a new recipe re-ingests every job once.

const HASH_DESCRIPTION_CHARS = 500;

/** sha256 hex of lower(company) + '\n' + lower(title) + '\n' + first 500 chars of the description (whitespace collapsed). */
export async function jobContentHash(input: { company: string | null; title: string; description: string }): Promise<string> {
  const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
  const text = [
    collapse(input.company ?? '').toLowerCase(),
    collapse(input.title).toLowerCase(),
    collapse(input.description).slice(0, HASH_DESCRIPTION_CHARS),
  ].join('\n');
  // Web Crypto: global in Workers and in Node >= 19.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
