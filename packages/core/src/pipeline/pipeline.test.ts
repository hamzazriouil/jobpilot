import { describe, expect, it } from 'vitest';
import {
  ANALYZE_PROMPT_VERSION,
  ANALYZE_SYSTEM_PROMPT,
  ANALYZE_V2_SYSTEM_PROMPT,
  DEFAULT_ANALYZE_PROMPT_VERSION,
  DRAFT_PROMPT_VERSION,
  SAMPLE_ANALYSIS_FIXTURE,
  SAMPLE_COUNTRY,
  SAMPLE_CV,
  SAMPLE_JOB,
} from '../prompts';
import { toAnalysisResult } from '../scoring';
import {
  ANALYZE_MAX_OUTPUT_TOKENS,
  AnalysisLLMTransport,
  analyzeCall,
  buildProviderConfig,
  DRAFT_MAX_OUTPUT_TOKENS,
  draftCall,
  finishAnalysis,
  finishDrafts,
  finishFollowUp,
  FOLLOWUP_MAX_CHARS,
  followUpCall,
  forceProvider,
  parseFallbackModels,
  parseThinkingLevel,
} from './index';

const ctx = { cvText: SAMPLE_CV, jobText: SAMPLE_JOB };

describe('analyzeCall / draftCall', () => {
  it('carries the prompt version, token cap and lenient schema', () => {
    const a = analyzeCall({ ...ctx, country: SAMPLE_COUNTRY });
    expect(a.task).toBe('analyze');
    expect(a.promptVersion).toBe(DEFAULT_ANALYZE_PROMPT_VERSION);
    expect(a.maxOutputTokens).toBe(ANALYZE_MAX_OUTPUT_TOKENS);
    expect(a.schema).toBe(AnalysisLLMTransport);
    expect(a.prompt).toContain('<cv>');

    const d = draftCall({ ...ctx, analysis: SAMPLE_ANALYSIS_FIXTURE });
    expect(d.task).toBe('draft');
    expect(d.promptVersion).toBe(DRAFT_PROMPT_VERSION);
    expect(d.maxOutputTokens).toBe(DRAFT_MAX_OUTPUT_TOKENS);
  });

  it('selects the prompt version by id', () => {
    const input = { ...ctx, country: SAMPLE_COUNTRY };
    const v1 = analyzeCall(input, 'v1');
    const v2 = analyzeCall(input, 'v2');
    expect(v1.promptVersion).toBe(ANALYZE_PROMPT_VERSION);
    expect(v1.system).toBe(ANALYZE_SYSTEM_PROMPT);
    expect(v2.promptVersion).toBe('analyze.v2');
    expect(v2.system).toBe(ANALYZE_V2_SYSTEM_PROMPT);
    expect(v2.prompt).toBe(v1.prompt); // same user message, only the system prompt differs
    expect(v2.temperature).toBe(v1.temperature);
  });

  it('builds the prompt only from the prompt fields', () => {
    const wide = { ...ctx, country: SAMPLE_COUNTRY, id: '001', tags: ['x'], expected: null };
    expect(analyzeCall(wide, 'v2').prompt).toBe(analyzeCall({ ...ctx, country: SAMPLE_COUNTRY }, 'v2').prompt);
  });
});

describe('finishAnalysis', () => {
  it('gives the same result as the scoring pipeline, plus the evidence details', () => {
    const served = { provider: 'gemini', model: 'm' };
    const out = finishAnalysis(AnalysisLLMTransport.parse(SAMPLE_ANALYSIS_FIXTURE), ctx, served);
    expect(out.result).toEqual(
      toAnalysisResult(SAMPLE_ANALYSIS_FIXTURE, ctx, { ...served, promptVersion: DEFAULT_ANALYZE_PROMPT_VERSION }),
    );
    expect(out.llm).toEqual(SAMPLE_ANALYSIS_FIXTURE);
    expect(out.evidence.downgrades).toBe(out.result.evidenceDowngrades);
  });

  it('records the version of the prompt that was used', () => {
    const served = { provider: 'gemini', model: 'm' };
    const raw = AnalysisLLMTransport.parse(SAMPLE_ANALYSIS_FIXTURE);
    expect(finishAnalysis(raw, ctx, served, 'v1').result.promptVersion).toBe('analyze.v1');
    expect(finishAnalysis(raw, ctx, served, 'v2').result.promptVersion).toBe('analyze.v2');
  });
});

describe('finishDrafts', () => {
  it('trims and flags facts missing from the sources', () => {
    const out = finishDrafts(
      { coverLetter: 'Hello,\n\nI shipped Zorblax at Acmeco in 2019.', coldDm: 'Hi,', cvBullets: [] },
      ctx,
    );
    expect(out.honestyFlags.map((f) => f.text)).toEqual(expect.arrayContaining(['2019']));
  });
});

describe('followUpCall / finishFollowUp', () => {
  it('builds a non-streaming call logged as follow_up', () => {
    const call = followUpCall({ ...ctx, role: 'AI Engineer', company: 'Quillstack', daysSinceApplied: 5, channel: 'email' });
    expect(call.task).toBe('follow_up');
    expect(call.promptVersion).toBe('followup.v1');
    expect(call.schema.safeParse({ message: 'Hi,' }).success).toBe(true);
    expect(call.schema.safeParse({ message: '' }).success).toBe(false);
  });

  it('trims long messages and flags facts missing from the sources', () => {
    const out = finishFollowUp({ message: `Hi,

I applied in 2019 and shipped Zorblax. ${'word '.repeat(200)}` }, ctx);
    expect(out.message.length).toBeLessThanOrEqual(FOLLOWUP_MAX_CHARS);
    expect(out.honestyFlags).toEqual(expect.arrayContaining([{ draft: 'followUp', text: '2019' }]));
  });
});

describe('provider config from env', () => {
  it('parses the Gemini overrides', () => {
    expect(parseThinkingLevel('OFF')).toBeNull();
    expect(parseThinkingLevel('low')).toBe('low');
    expect(parseThinkingLevel('')).toBeUndefined();
    expect(parseFallbackModels('none')).toEqual([]);
    expect(parseFallbackModels('a, b')).toEqual([{ model: 'a' }, { model: 'b' }]);
  });

  it('prefers Workers REST outside production', () => {
    const env = { CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_API_TOKEN: 'tok', AI: { run: () => null } };
    expect(buildProviderConfig(env, false).workers).toEqual({ accountId: 'acc', apiToken: 'tok' });
    expect(buildProviderConfig(env, true).workers).toEqual({ binding: env.AI });
  });

  it('forceProvider keeps only the chosen provider', () => {
    const cfg = buildProviderConfig(
      { GOOGLE_GENERATIVE_AI_API_KEY: 'g', CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_API_TOKEN: 't' },
      false,
    );
    const g = forceProvider(cfg, 'gemini')!;
    expect(Object.keys(g.providers)).toEqual(['gemini']);
    const w = forceProvider(cfg, 'workers')!;
    expect(Object.keys(w.providers)).toEqual(['workers']);
    expect(forceProvider(cfg, 'claude')).toBeNull();
  });
});
