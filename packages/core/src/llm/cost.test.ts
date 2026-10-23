import { describe, expect, it } from 'vitest';
import { estimateCost, getPrice } from './cost';

describe('estimateCost', () => {
  it('free-tier gemini and workers cost 0 regardless of tokens', () => {
    expect(estimateCost('gemini', 'gemini-3.8-flash', { inputTokens: 50_000, outputTokens: 4_000 })).toBe(0);
    expect(estimateCost('workers', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', { inputTokens: 9_999, outputTokens: 1 })).toBe(0);
  });

  it('claude uses the per-1M-token table', () => {
    const p = getPrice('claude', 'claude-haiku-5-5');
    expect(estimateCost('claude', 'claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 0 })).toBe(p.inputPerMTok);
    expect(estimateCost('claude', 'claude-haiku-5-5', { inputTokens: 0, outputTokens: 1_000_000 })).toBe(p.outputPerMTok);
    expect(estimateCost('claude', 'claude-haiku-5-5', { inputTokens: 3_000, outputTokens: 1_000 })).toBeCloseTo(
      (3_000 * p.inputPerMTok + 1_000 * p.outputPerMTok) / 1e6,
      6,
    );
  });

  it('rounds to 6 decimals (numeric(10,6)) and treats null tokens as 0', () => {
    const c = estimateCost('claude', 'claude-haiku-5-5', { inputTokens: 1, outputTokens: null });
    expect(Number.isFinite(c)).toBe(true);
    expect(c.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(6);
    expect(estimateCost('claude', 'claude-haiku-5-5', { inputTokens: null, outputTokens: null })).toBe(0);
  });

  it('unknown models fall back to the provider default', () => {
    expect(estimateCost('gemini', 'some-future-flash', { inputTokens: 100, outputTokens: 100 })).toBe(0);
    expect(getPrice('claude', 'claude-unknown')).toEqual(getPrice('claude', '*'));
  });
});
