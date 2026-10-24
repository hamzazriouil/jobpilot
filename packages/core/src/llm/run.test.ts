import { APICallError, simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmError } from './errors';
import type { LlmCallRow, LlmCallSink } from './log';
import type { ProviderConfig } from './providers';
import { runLLM, type RunLLMBaseOptions } from './run';

// ───────────── helpers ─────────────

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

const genResult = (text: string, u = usage(10, 20)) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage: u,
  warnings: [],
});

const apiError = (statusCode: number) =>
  new APICallError({ message: `HTTP ${statusCode}`, url: 'https://example.test', requestBodyValues: {}, statusCode });

function textModel(modelId: string, ...texts: string[]) {
  return new MockLanguageModelV4({ provider: modelId, modelId, doGenerate: texts.map((t) => genResult(t)) });
}

function failingModel(modelId: string, statusCode: number) {
  return new MockLanguageModelV4({
    provider: modelId,
    modelId,
    doGenerate: async () => {
      throw apiError(statusCode);
    },
    doStream: async () => {
      throw apiError(statusCode);
    },
  });
}

/** Never answers; rejects only when aborted. */
function hangingModel(modelId: string) {
  const hang = (opts: { abortSignal?: AbortSignal }) =>
    new Promise<never>((_, reject) => {
      opts.abortSignal?.addEventListener('abort', () => reject(opts.abortSignal?.reason));
    });
  return new MockLanguageModelV4({ provider: modelId, modelId, doGenerate: hang, doStream: hang });
}

function streamModel(modelId: string, deltas: string[], u = usage(5, 7)) {
  return new MockLanguageModelV4({
    provider: modelId,
    modelId,
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start' as const, id: 't1' },
          ...deltas.map((delta) => ({ type: 'text-delta' as const, id: 't1', delta })),
          { type: 'text-end' as const, id: 't1' },
          { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage: u },
        ],
      }),
    }),
  });
}

function memorySink(): LlmCallSink & { rows: LlmCallRow[] } {
  const rows: LlmCallRow[] = [];
  return { rows, record: (row) => void rows.push(row) };
}

const Schema = z.object({ score: z.number().int().min(0).max(100), label: z.string() });
const VALID = '{"score":72,"label":"good"}';
const INVALID = '{"score":"high","label":"good"}';

const SECRET_PROMPT = 'CV TEXT: Jane Doe, jane@secret.example, 10 years Rust';
const SECRET_SYSTEM = 'SYSTEM PROMPT SECRET v1';

function baseOpts(providers: ProviderConfig, sink: LlmCallSink, extra: Partial<RunLLMBaseOptions> = {}): RunLLMBaseOptions {
  return {
    task: 'analyze',
    system: SECRET_SYSTEM,
    prompt: SECRET_PROMPT,
    plan: 'free',
    country: 'US',
    promptVersion: 'analyze@1',
    userId: '00000000-0000-0000-0000-000000000001',
    providers,
    sink,
    ...extra,
  };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

// ───────────── non-stream structured ─────────────

describe('runLLM (structured, non-stream)', () => {
  it('returns the validated object from the first provider', async () => {
    const sink = memorySink();
    const res = await runLLM({
      ...baseOpts({ gemini: { languageModel: textModel('gemini-test', VALID) } }, sink),
      schema: Schema,
    });
    expect(res.object).toEqual({ score: 72, label: 'good' });
    expect(res).toMatchObject({ provider: 'gemini', model: 'gemini-test', retries: 0, costUsd: 0 });
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(sink.rows).toHaveLength(1);
  });

  it('falls back to workers when gemini returns 429', async () => {
    const sink = memorySink();
    const gemini = failingModel('gemini-test', 429);
    const workers = textModel('workers-test', VALID);
    const res = await runLLM({
      ...baseOpts({ gemini: { languageModel: gemini }, workers: { languageModel: workers } }, sink),
      schema: Schema,
    });
    expect(res.provider).toBe('workers');
    expect(res.retries).toBe(1);
    expect(sink.rows.map((r) => [r.provider, r.error_code, r.retries])).toEqual([
      ['gemini', 'http_429', 0],
      ['workers', null, 1],
    ]);
  });

  it('EEA users never hit gemini, even if configured', async () => {
    const gemini = textModel('gemini-test', VALID);
    const workers = textModel('workers-test', VALID);
    const res = await runLLM({
      ...baseOpts({ gemini: { languageModel: gemini }, workers: { languageModel: workers } }, memorySink(), {
        country: 'DE',
      }),
      schema: Schema,
    });
    expect(res.provider).toBe('workers');
    expect(gemini.doGenerateCalls).toHaveLength(0);
  });

  it('EEA user whose only provider is rate-limited gets busy (no gemini fallback)', async () => {
    const gemini = textModel('gemini-test', VALID);
    const err = await runLLM({
      ...baseOpts({ gemini: { languageModel: gemini }, workers: { languageModel: failingModel('w', 429) } }, memorySink(), {
        country: 'FR',
      }),
      schema: Schema,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe('busy');
    expect(gemini.doGenerateCalls).toHaveLength(0);
  });

  it('repair retry succeeds the second time, with validation errors appended', async () => {
    const sink = memorySink();
    const gemini = textModel('gemini-test', INVALID, VALID);
    const res = await runLLM({ ...baseOpts({ gemini: { languageModel: gemini } }, sink), schema: Schema });
    expect(res.object).toEqual({ score: 72, label: 'good' });
    expect(res.retries).toBe(1);
    expect(gemini.doGenerateCalls).toHaveLength(2);
    const repairPrompt = JSON.stringify(gemini.doGenerateCalls[1]?.prompt);
    expect(repairPrompt).toContain('Validation errors');
    expect(repairPrompt).toContain('score');
    expect(sink.rows.map((r) => [r.schema_valid, r.error_code, r.retries])).toEqual([
      [false, 'schema_invalid', 0],
      [true, null, 1],
    ]);
  });

  it('throws schema_invalid when the repair also fails (no fallback to other providers)', async () => {
    const sink = memorySink();
    const workers = textModel('workers-test', VALID);
    const err = await runLLM({
      ...baseOpts(
        { gemini: { languageModel: textModel('gemini-test', INVALID, 'not json at all') }, workers: { languageModel: workers } },
        sink,
      ),
      schema: Schema,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe('schema_invalid');
    expect(workers.doGenerateCalls).toHaveLength(0);
    expect(sink.rows.map((r) => r.schema_valid)).toEqual([false, false]);
  });

  it('accepts fenced JSON without spending a repair call', async () => {
    const gemini = textModel('gemini-test', '```json\n' + VALID + '\n```');
    const res = await runLLM({ ...baseOpts({ gemini: { languageModel: gemini } }, memorySink()), schema: Schema });
    expect(res.object).toEqual({ score: 72, label: 'good' });
    expect(gemini.doGenerateCalls).toHaveLength(1);
  });

  it('times out a hanging provider and falls back', async () => {
    const sink = memorySink();
    const res = await runLLM({
      ...baseOpts(
        { gemini: { languageModel: hangingModel('gemini-test') }, workers: { languageModel: textModel('workers-test', VALID) } },
        sink,
        { timeoutMs: 50 },
      ),
      schema: Schema,
    });
    expect(res.provider).toBe('workers');
    expect(sink.rows[0]).toMatchObject({ provider: 'gemini', error_code: 'timeout', schema_valid: null });
    expect(sink.rows[0]?.latency_ms).toBeGreaterThanOrEqual(40);
  });

  it('throws timeout when every provider times out', async () => {
    const err = await runLLM({
      ...baseOpts(
        { gemini: { languageModel: hangingModel('g') }, workers: { languageModel: hangingModel('w') } },
        memorySink(),
        { timeoutMs: 30 },
      ),
      schema: Schema,
    }).catch((e: unknown) => e);
    expect((err as LlmError).code).toBe('timeout');
  });

  it('throws busy when every provider returns 5xx/429', async () => {
    const err = await runLLM({
      ...baseOpts({ gemini: { languageModel: failingModel('g', 503) }, workers: { languageModel: failingModel('w', 429) } }, memorySink()),
      schema: Schema,
    }).catch((e: unknown) => e);
    expect((err as LlmError).code).toBe('busy');
    expect((err as LlmError).attempts.map((a) => a.errorCode)).toEqual(['http_503', 'http_429']);
  });

  it('does not fall back on non-retryable errors', async () => {
    const workers = textModel('workers-test', VALID);
    const err = await runLLM({
      ...baseOpts({ gemini: { languageModel: failingModel('g', 400) }, workers: { languageModel: workers } }, memorySink()),
      schema: Schema,
    }).catch((e: unknown) => e);
    expect((err as LlmError).code).toBe('provider_error');
    expect(workers.doGenerateCalls).toHaveLength(0);
  });

  it('bad_config when no provider in the route is configured, or auth fails', async () => {
    const e1 = await runLLM({ ...baseOpts({}, memorySink()), schema: Schema }).catch((e: unknown) => e);
    expect((e1 as LlmError).code).toBe('bad_config');
    const e2 = await runLLM({
      ...baseOpts({ gemini: { apiKey: '' } }, memorySink()),
      schema: Schema,
    }).catch((e: unknown) => e);
    expect((e2 as LlmError).code).toBe('bad_config');
    const e3 = await runLLM({
      ...baseOpts({ gemini: { languageModel: failingModel('g', 401) } }, memorySink()),
      schema: Schema,
    }).catch((e: unknown) => e);
    expect((e3 as LlmError).code).toBe('bad_config');
  });

  it('routes paid users to claude only when claudeEnabled', async () => {
    const claude = textModel('claude-haiku-5-5', VALID, VALID);
    const providers = (claudeEnabled: boolean): ProviderConfig => ({
      claude: { languageModel: claude },
      gemini: { languageModel: textModel('gemini-test', VALID) },
      claudeEnabled,
    });
    const on = await runLLM({ ...baseOpts(providers(true), memorySink(), { plan: 'sprint30' }), schema: Schema });
    expect(on.provider).toBe('claude');
    expect(on.costUsd).toBeGreaterThan(0);
    const off = await runLLM({ ...baseOpts(providers(false), memorySink(), { plan: 'sprint30' }), schema: Schema });
    expect(off.provider).toBe('gemini');
    const free = await runLLM({ ...baseOpts(providers(true), memorySink(), { plan: 'free' }), schema: Schema });
    expect(free.provider).toBe('gemini');
  });
});

// ───────────── sink rows ─────────────

describe('LlmCallSink rows', () => {
  it('one row per attempt, exact llm_calls columns, no prompt/response text', async () => {
    const sink = memorySink();
    await runLLM({
      ...baseOpts(
        {
          gemini: { languageModel: failingModel('gemini-test', 429) },
          workers: { languageModel: textModel('workers-test', INVALID, VALID) },
        },
        sink,
      ),
      schema: Schema,
    });
    expect(sink.rows).toHaveLength(3);
    const columns = [
      'feature',
      'provider',
      'model',
      'prompt_version',
      'input_tokens',
      'output_tokens',
      'latency_ms',
      'cost_usd',
      'schema_valid',
      'retries',
      'error_code',
      'user_id',
    ].sort();
    for (const row of sink.rows) {
      expect(Object.keys(row).sort()).toEqual(columns);
      expect(row).toMatchObject({
        feature: 'analyze',
        prompt_version: 'analyze@1',
        user_id: '00000000-0000-0000-0000-000000000001',
        cost_usd: 0,
      });
      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain('Jane');
      expect(serialized).not.toContain('SECRET');
      expect(serialized).not.toContain('"label"');
      expect(serialized).not.toContain('high');
    }
    expect(sink.rows.map((r) => [r.provider, r.model, r.retries, r.error_code, r.schema_valid])).toEqual([
      ['gemini', 'gemini-test', 0, 'http_429', null],
      ['workers', 'workers-test', 1, 'schema_invalid', false],
      ['workers', 'workers-test', 2, null, true],
    ]);
    expect(sink.rows[2]).toMatchObject({ input_tokens: 10, output_tokens: 20 });
  });

  it('a throwing sink never breaks the call', async () => {
    const res = await runLLM({
      ...baseOpts({ gemini: { languageModel: textModel('g', VALID) } }, {
        record: () => {
          throw new Error('db down');
        },
      }),
      schema: Schema,
    });
    expect(res.object.score).toBe(72);
  });
});

// ───────────── plain text ─────────────

describe('runLLM (plain text)', () => {
  it('returns text without a schema', async () => {
    const sink = memorySink();
    const res = await runLLM(baseOpts({ gemini: { languageModel: textModel('g', 'Hello there') } }, sink));
    expect(res.text).toBe('Hello there');
    expect(sink.rows[0]?.schema_valid).toBeNull();
  });

  it('streams text deltas', async () => {
    const res = await runLLM({
      ...baseOpts({ gemini: { languageModel: streamModel('g', ['Hel', 'lo']) } }, memorySink()),
      stream: true,
    });
    expect((await collect(res.textStream)).join('')).toBe('Hello');
    expect((await res.final).text).toBe('Hello');
  });
});

// ───────────── stream structured ─────────────

describe('runLLM (structured, stream)', () => {
  const deltas = ['{"sco', 're":72', ',"label":"go', 'od"}'];

  it('emits partial objects, then the validated final object', async () => {
    const sink = memorySink();
    const res = await runLLM({
      ...baseOpts({ gemini: { languageModel: streamModel('gemini-test', deltas) } }, sink),
      schema: Schema,
      stream: true,
    });
    expect(res.provider).toBe('gemini');
    const partials = await collect(res.partialObjectStream);
    expect(partials.length).toBeGreaterThan(1);
    expect(partials.at(-1)).toEqual({ score: 72, label: 'good' });
    const final = await res.final;
    expect(final.object).toEqual({ score: 72, label: 'good' });
    expect(final.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
    expect(sink.rows).toHaveLength(1);
    expect(sink.rows[0]).toMatchObject({ schema_valid: true, error_code: null, input_tokens: 5 });
  });

  it('final resolves even if nobody reads the partial stream', async () => {
    const res = await runLLM({
      ...baseOpts({ gemini: { languageModel: streamModel('g', deltas) } }, memorySink()),
      schema: Schema,
      stream: true,
    });
    expect((await res.final).object.score).toBe(72);
  });

  it('falls back when the initial connection fails (429 before any token)', async () => {
    const sink = memorySink();
    const res = await runLLM({
      ...baseOpts(
        { gemini: { languageModel: failingModel('gemini-test', 429) }, workers: { languageModel: streamModel('workers-test', deltas) } },
        sink,
      ),
      schema: Schema,
      stream: true,
    });
    expect(res.provider).toBe('workers');
    expect((await res.final).object).toEqual({ score: 72, label: 'good' });
    expect(sink.rows.map((r) => [r.provider, r.error_code])).toEqual([
      ['gemini', 'http_429'],
      ['workers', null],
    ]);
  });

  it('falls back when the first token does not arrive in time', async () => {
    const res = await runLLM({
      ...baseOpts(
        { gemini: { languageModel: hangingModel('g') }, workers: { languageModel: streamModel('w', deltas) } },
        memorySink(),
        { timeoutMs: 50 },
      ),
      schema: Schema,
      stream: true,
    });
    expect(res.provider).toBe('workers');
  });

  it('repairs an invalid streamed object with one non-stream retry', async () => {
    const sink = memorySink();
    const model = new MockLanguageModelV4({
      provider: 'g',
      modelId: 'gemini-test',
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start' as const, id: 't1' },
            { type: 'text-delta' as const, id: 't1', delta: INVALID },
            { type: 'text-end' as const, id: 't1' },
            { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage: usage(5, 7) },
          ],
        }),
      }),
      doGenerate: [genResult(VALID)],
    });
    const res = await runLLM({ ...baseOpts({ gemini: { languageModel: model } }, sink), schema: Schema, stream: true });
    const final = await res.final;
    expect(final.object).toEqual({ score: 72, label: 'good' });
    expect(final.retries).toBe(1);
    expect(sink.rows.map((r) => [r.schema_valid, r.error_code])).toEqual([
      [false, 'schema_invalid'],
      [true, null],
    ]);
  });

  it('rejects final with schema_invalid when the stream repair also fails', async () => {
    const model = new MockLanguageModelV4({
      provider: 'g',
      modelId: 'gemini-test',
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start' as const, id: 't1' },
            { type: 'text-delta' as const, id: 't1', delta: INVALID },
            { type: 'text-end' as const, id: 't1' },
            { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage: usage(5, 7) },
          ],
        }),
      }),
      doGenerate: [genResult(INVALID)],
    });
    const res = await runLLM({ ...baseOpts({ gemini: { languageModel: model } }, memorySink()), schema: Schema, stream: true });
    const err = await res.final.catch((e: unknown) => e);
    expect((err as LlmError).code).toBe('schema_invalid');
  });

  it('rejects with busy when no provider can open a stream', async () => {
    const err = await runLLM({
      ...baseOpts({ gemini: { languageModel: failingModel('g', 503) }, workers: { languageModel: failingModel('w', 429) } }, memorySink()),
      schema: Schema,
      stream: true,
    }).catch((e: unknown) => e);
    expect((err as LlmError).code).toBe('busy');
  });

  /** First token arrives, then the provider reports an in-stream error (Gemini's "high demand" 503). */
  function midStreamFailure(modelId: string, statusCode: number) {
    return new MockLanguageModelV4({
      provider: modelId,
      modelId,
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start' as const, id: 't1' },
            { type: 'text-delta' as const, id: 't1', delta: '{"score":10' },
            { type: 'error' as const, error: { name: 'AI_StreamProviderError', statusCode, message: 'high demand' } },
          ],
        }),
      }),
    });
  }

  it('falls back to the next provider when a structured stream fails mid-way with a retryable error', async () => {
    const sink = memorySink();
    const res = await runLLM({
      ...baseOpts(
        { gemini: { languageModel: midStreamFailure('gemini-test', 503) }, workers: { languageModel: streamModel('workers-test', deltas) } },
        sink,
      ),
      schema: Schema,
      stream: true,
    });
    expect(res.provider).toBe('gemini'); // first token came from gemini
    const partials = await collect(res.partialObjectStream);
    expect(partials[0]).toEqual({ score: 10 });
    expect(partials.at(-1)).toEqual({ score: 72, label: 'good' }); // restarted from workers' output
    const final = await res.final;
    expect([final.provider, final.object]).toEqual(['workers', { score: 72, label: 'good' }]);
    expect(sink.rows.map((r) => [r.provider, r.error_code])).toEqual([
      ['gemini', 'http_503'],
      ['workers', null],
    ]);
  });

  it('keeps a mid-way failure final in text mode (delivered deltas cannot be taken back)', async () => {
    const res = await runLLM({
      ...baseOpts(
        { gemini: { languageModel: midStreamFailure('g', 503) }, workers: { languageModel: streamModel('w', ['hello']) } },
        memorySink(),
      ),
      stream: true,
    });
    await collect(res.textStream);
    expect(((await res.final.catch((e: unknown) => e)) as LlmError).code).toBe('provider_error');
  });

  it('streams plain text (no JSON response format) for providers without native structured streaming', async () => {
    const model = streamModel('workers-test', ['```json\n', ...deltas, '\n```']);
    const res = await runLLM({
      ...baseOpts({ workers: { languageModel: model, nativeStructuredStream: false } }, memorySink(), { country: 'DE' }),
      schema: Schema,
      stream: true,
    });
    expect((await collect(res.partialObjectStream)).length).toBeGreaterThan(1);
    expect((await res.final).object).toEqual({ score: 72, label: 'good' });
    expect(model.doStreamCalls[0]?.responseFormat?.type ?? 'text').toBe('text');
  });
});
