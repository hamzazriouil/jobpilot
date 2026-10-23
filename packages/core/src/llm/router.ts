import { APICallError, RetryError } from 'ai';
import { isEeaUkCh } from '../regions';
import { LlmTimeoutError } from './errors';
import type { ProviderKey } from './providers';

/** `free` = no active entitlement (see plan_kind enum in 02-DATABASE). */
export type LlmPlan = 'free' | 'sprint30' | 'sprint90';

export interface RouteInput {
  plan: LlmPlan;
  /** ISO-2 country from Cloudflare `request.cf.country`. Never the user's self-declared country. */
  country: string | null | undefined;
  claudeEnabled: boolean;
}

/**
 * True when the request must NOT be served by the Gemini free tier (§4.1–4.2).
 * Unknown / missing / malformed country codes (e.g. Cloudflare `XX`, `T1` for Tor) are treated
 * as restricted: compliance errs on the side of not sending the data to Gemini.
 */
export function isRestrictedRegion(country: string | null | undefined): boolean {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return true;
  const cc = country.toUpperCase();
  if (cc === 'XX' || cc === 'T1') return true;
  return isEeaUkCh(cc);
}

/**
 * Provider order per §4.2:
 * - paid plan with Claude enabled → claude first, then the region's free fallbacks
 * - EEA/UK/CH (or unknown) country → workers only (no Gemini fallback, ever)
 * - otherwise                      → gemini, then workers
 * Free users never get Claude.
 */
export function pickProviderOrder({ plan, country, claudeEnabled }: RouteInput): ProviderKey[] {
  const free: ProviderKey[] = isRestrictedRegion(country) ? ['workers'] : ['gemini', 'workers'];
  const paid = plan === 'sprint30' || plan === 'sprint90';
  return paid && claudeEnabled ? ['claude', ...free] : free;
}

export interface ClassifiedError {
  /** Fallback to the next provider is allowed (429, 5xx, timeout, network). */
  retryable: boolean;
  /** Value for `llm_calls.error_code`, e.g. `http_429`, `timeout`, `network`. */
  errorCode: string;
  /** Auth/config problem (401/403). */
  badConfig: boolean;
  timeout: boolean;
}

function unwrap(error: unknown): unknown {
  // With maxRetries: 0 the SDK normally rethrows the original error, but be defensive.
  if (RetryError.isInstance(error)) return error.lastError;
  return error;
}

export function classifyError(error: unknown): ClassifiedError {
  const e = unwrap(error);
  if (e instanceof LlmTimeoutError || isAbortOrTimeout(e)) {
    return { retryable: true, errorCode: 'timeout', badConfig: false, timeout: true };
  }
  if (APICallError.isInstance(e)) {
    const status = e.statusCode;
    if (status === 429 || status === 408 || (status !== undefined && status >= 500)) {
      return { retryable: true, errorCode: `http_${status}`, badConfig: false, timeout: status === 408 };
    }
    if (status === 401 || status === 403) {
      return { retryable: false, errorCode: `http_${status}`, badConfig: true, timeout: false };
    }
    if (status === undefined) {
      // No HTTP status: network failure / connection reset. The SDK marks these retryable.
      return { retryable: e.isRetryable, errorCode: 'network', badConfig: false, timeout: false };
    }
    return { retryable: false, errorCode: `http_${status}`, badConfig: false, timeout: false };
  }
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
    return { retryable: true, errorCode: 'network', badConfig: false, timeout: false };
  }
  return { retryable: false, errorCode: 'provider_error', badConfig: false, timeout: false };
}

export function isRetryableError(error: unknown): boolean {
  return classifyError(error).retryable;
}

function isAbortOrTimeout(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const name = (e as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}
