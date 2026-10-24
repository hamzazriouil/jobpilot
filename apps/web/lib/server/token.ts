import { z } from 'zod';
import { AnalysisResult } from '@jobpilot/core/schemas';
import { deflateRaw, fromBase64Url, hmacSha256, inflateRaw, sha256Hex, timingSafeEqual, toBase64Url, utf8 } from './crypto';

// analysisToken (docs/05-ARCHITECTURE.md §5.2): lets /api/draft trust an analysis without a database
// for anonymous users. Format: `<payload>.<signature>`, both base64url, where
//   payload   = deflate-raw(JSON { v: 1, result, cvHash, jobHash, exp })
//   signature = HMAC-SHA256(ANALYSIS_TOKEN_SECRET, payload string)
// The JSON is compressed because a full AnalysisResult (20 requirements with quotes and notes) can
// exceed DraftRequest's 20k-char token cap as plain base64. The signature is checked (constant time)
// BEFORE anything is inflated or parsed, so only tokens we minted are ever decompressed.
// The token is opaque to the client and is not encrypted: it only holds the client's own analysis.

export const ANALYSIS_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

const TokenPayload = z.object({
  v: z.literal(1),
  result: AnalysisResult,
  cvHash: z.string(),
  jobHash: z.string(),
  exp: z.number().int(),
});
export type AnalysisTokenPayload = z.infer<typeof TokenPayload>;

export interface TokenTexts {
  cvText: string;
  jobText: string;
}

/** sha256 hex of the trimmed text, so whitespace around a paste doesn't break the match. */
export function hashText(text: string): Promise<string> {
  return sha256Hex(text.trim());
}

export async function signAnalysisToken(
  result: AnalysisResult,
  texts: TokenTexts,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload: AnalysisTokenPayload = {
    v: 1,
    result,
    cvHash: await hashText(texts.cvText),
    jobHash: await hashText(texts.jobText),
    exp: now + ANALYSIS_TOKEN_TTL_MS,
  };
  const body = toBase64Url(await deflateRaw(utf8(JSON.stringify(payload))));
  const sig = toBase64Url(await hmacSha256(secret, utf8(body)));
  return `${body}.${sig}`;
}

export type VerifyTokenResult =
  | { ok: true; payload: AnalysisTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'mismatch' };

export async function verifyAnalysisToken(
  token: string,
  texts: TokenTexts,
  secret: string,
  now = Date.now(),
): Promise<VerifyTokenResult> {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [body, sigText] = parts as [string, string];
  const sig = fromBase64Url(sigText);
  if (!body || !sig) return { ok: false, reason: 'malformed' };

  const expected = await hmacSha256(secret, utf8(body));
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: 'bad_signature' };

  let payload: AnalysisTokenPayload;
  try {
    const raw = fromBase64Url(body);
    if (!raw) return { ok: false, reason: 'malformed' };
    const parsed = TokenPayload.safeParse(JSON.parse(new TextDecoder().decode(await inflateRaw(raw))));
    if (!parsed.success) return { ok: false, reason: 'malformed' };
    payload = parsed.data;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (payload.exp <= now) return { ok: false, reason: 'expired' };
  const [cvHash, jobHash] = await Promise.all([hashText(texts.cvText), hashText(texts.jobText)]);
  if (cvHash !== payload.cvHash || jobHash !== payload.jobHash) return { ok: false, reason: 'mismatch' };
  return { ok: true, payload };
}
