import { sha256Hex } from './crypto';

// Anonymous quota subject (docs/05-ARCHITECTURE.md §9, §14): `ip:` + sha256(ip + IP_HASH_SALT + UTC date).
// The date in the hash makes the subject rotate daily, so hashes can't be linked across days.
// Raw IPs are never stored or logged.

/** Shared bucket for requests whose IP we can't read (should not happen behind Cloudflare). */
export const UNKNOWN_IP = 'unknown';

/**
 * Client IP: Cloudflare's `cf-connecting-ip`. `x-forwarded-for` (first hop) is trusted only outside
 * production, where it is what `next dev` and local tools send; in production it is client-controlled.
 */
export function clientIp(headers: Headers, isProd: boolean): string {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  if (!isProd) {
    const xff = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (xff) return xff;
  }
  return UNKNOWN_IP;
}

/** `YYYY-MM-DD` in UTC (matches Postgres `current_date` on Supabase, which runs in UTC). */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function ipSubject(ip: string, salt: string, now: Date = new Date()): Promise<string> {
  return `ip:${await sha256Hex(ip + salt + utcDay(now))}`;
}

/** The anonymous subject for this request, or null (quota then fails open) when IP_HASH_SALT is missing. */
export async function anonSubject(headers: Headers, salt: string | undefined, isProd: boolean): Promise<string | null> {
  if (!salt) {
    console.error(JSON.stringify({ type: 'config_missing', name: 'IP_HASH_SALT' }));
    return null;
  }
  return ipSubject(clientIp(headers, isProd), salt);
}
