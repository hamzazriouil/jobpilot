import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { LlmTimeoutError } from './errors';
import { classifyError, isRestrictedRegion, pickProviderOrder } from './router';

describe('pickProviderOrder (§4.2 routing table)', () => {
  it('paid plan + claude enabled → claude first, then region fallbacks', () => {
    expect(pickProviderOrder({ plan: 'sprint30', country: 'US', claudeEnabled: true })).toEqual([
      'claude',
      'gemini',
      'workers',
    ]);
    expect(pickProviderOrder({ plan: 'sprint90', country: 'MA', claudeEnabled: true })).toEqual([
      'claude',
      'gemini',
      'workers',
    ]);
  });

  it('paid EEA user with claude → claude then workers only (never gemini)', () => {
    expect(pickProviderOrder({ plan: 'sprint30', country: 'FR', claudeEnabled: true })).toEqual(['claude', 'workers']);
  });

  it('EEA / UK / CH → workers only', () => {
    for (const cc of ['DE', 'FR', 'GB', 'CH', 'NO', 'IS', 'LI', 'IE', 'fr']) {
      expect(pickProviderOrder({ plan: 'free', country: cc, claudeEnabled: false })).toEqual(['workers']);
    }
  });

  it('default (non-EEA) → gemini then workers', () => {
    for (const cc of ['US', 'MA', 'IN', 'BR', 'CA']) {
      expect(pickProviderOrder({ plan: 'free', country: cc, claudeEnabled: false })).toEqual(['gemini', 'workers']);
    }
  });

  it('claude disabled → paid users get the free route', () => {
    expect(pickProviderOrder({ plan: 'sprint30', country: 'US', claudeEnabled: false })).toEqual(['gemini', 'workers']);
    expect(pickProviderOrder({ plan: 'sprint90', country: 'DE', claudeEnabled: false })).toEqual(['workers']);
  });

  it('free users never get claude, even when enabled', () => {
    expect(pickProviderOrder({ plan: 'free', country: 'US', claudeEnabled: true })).not.toContain('claude');
    expect(pickProviderOrder({ plan: 'free', country: 'DE', claudeEnabled: true })).not.toContain('claude');
  });

  it('unknown / missing country is treated as restricted (no gemini)', () => {
    for (const cc of [undefined, null, '', 'XX', 'T1', 'USA']) {
      expect(isRestrictedRegion(cc)).toBe(true);
      expect(pickProviderOrder({ plan: 'free', country: cc, claudeEnabled: false })).toEqual(['workers']);
    }
  });
});

describe('classifyError', () => {
  const apiError = (statusCode?: number) =>
    new APICallError({ message: 'x', url: 'https://example.test', requestBodyValues: {}, statusCode });

  it('429 / 5xx / timeout are retryable', () => {
    expect(classifyError(apiError(429))).toMatchObject({ retryable: true, errorCode: 'http_429' });
    expect(classifyError(apiError(500))).toMatchObject({ retryable: true, errorCode: 'http_500' });
    expect(classifyError(apiError(503))).toMatchObject({ retryable: true, errorCode: 'http_503' });
    expect(classifyError(new LlmTimeoutError(25_000))).toMatchObject({ retryable: true, errorCode: 'timeout', timeout: true });
  });

  it('4xx (other than 408/429) are not retryable; 401/403 flag bad config', () => {
    expect(classifyError(apiError(400))).toMatchObject({ retryable: false, errorCode: 'http_400', badConfig: false });
    expect(classifyError(apiError(401))).toMatchObject({ retryable: false, badConfig: true });
    expect(classifyError(apiError(403))).toMatchObject({ retryable: false, badConfig: true });
    expect(classifyError(new Error('boom'))).toMatchObject({ retryable: false, errorCode: 'provider_error' });
  });
});
