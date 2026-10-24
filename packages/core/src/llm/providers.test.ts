import { describe, expect, it } from 'vitest';
import {
  createGeminiModels,
  DEFAULT_GEMINI_MODEL,
  geminiThinkingLevelFor,
  resolveModels,
} from './providers';

describe('Gemini model chain', () => {
  it('defaults to the main model followed by DEFAULT_GEMINI_FALLBACKS', () => {
    expect(createGeminiModels({ apiKey: 'k' }).map((m) => m.modelId)).toEqual([DEFAULT_GEMINI_MODEL, 'gemini-3.6-flash']);
  });

  it('honours an override, drops duplicates and allows no fallback', () => {
    expect(createGeminiModels({ apiKey: 'k', model: 'gemini-3.6-flash' }).map((m) => m.modelId)).toEqual(['gemini-3.6-flash']);
    expect(createGeminiModels({ apiKey: 'k', fallbacks: [] }).map((m) => m.modelId)).toEqual([DEFAULT_GEMINI_MODEL]);
  });

  it('sends a benchmarked thinking level only to the model it was measured on, unless told otherwise', () => {
    expect(geminiThinkingLevelFor({ model: 'gemini-3.6-flash' })).toBe('minimal');
    expect(geminiThinkingLevelFor({ model: DEFAULT_GEMINI_MODEL })).toBeNull();
    expect(geminiThinkingLevelFor({ model: 'gemini-3.6-flash', thinkingLevel: null })).toBeNull();
    expect(geminiThinkingLevelFor({ model: 'x', thinkingLevel: 'low' })).toBe('low');
  });

  it('resolveModels lists every route candidate and nothing when unconfigured', () => {
    expect(resolveModels('gemini', { gemini: { apiKey: 'k' } })).toHaveLength(2);
    expect(resolveModels('gemini', { gemini: { apiKey: '' } })).toEqual([]);
    const workers = resolveModels('workers', { workers: { accountId: 'a', apiToken: 't' } });
    expect(workers.map((m) => [m.provider, m.nativeStructuredStream])).toEqual([['workers', false]]);
  });
});
