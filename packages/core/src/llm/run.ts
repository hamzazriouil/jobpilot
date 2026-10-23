import {
  generateText,
  NoObjectGeneratedError,
  Output,
  parsePartialJson,
  streamText,
  type DeepPartial,
  type FlexibleSchema,
  type LanguageModelUsage,
  type ModelMessage,
} from 'ai';
import type { z } from 'zod';
import { estimateCost, type LlmUsage } from './cost';
import { LlmError, LlmTimeoutError, type LlmAttemptSummary, type LlmErrorCode } from './errors';
import { noopSink, safeRecord, type LlmCallSink } from './log';
import { resolveModel, type ProviderConfig, type ProviderKey, type ResolvedModel } from './providers';
import { classifyError, pickProviderOrder, type ClassifiedError, type LlmPlan } from './router';
import { buildRepairMessage, parseWithSchema } from './validate';

export const DEFAULT_TIMEOUT_MS = 25_000;
export const DEFAULT_STREAM_TIMEOUT_MS = 120_000;

type ProviderOptions = Parameters<typeof generateText>[0]['providerOptions'];

export interface RunLLMBaseOptions {
  /** Feature name, logged as `llm_calls.feature` (analyze | draft | parse | ...). */
  task: string;
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  userId?: string | null;
  plan: LlmPlan;
  /** Cloudflare `request.cf.country`. Missing/unknown → treated as EEA/UK/CH (workers only). */
  country: string | null | undefined;
  promptVersion: string;
  providers: ProviderConfig;
  sink?: LlmCallSink;
  /**
   * Per-attempt budget. Non-stream: whole call. Stream: time until the first token
   * (after that the stream is committed to that provider). Default 25s (§4.2).
   */
  timeoutMs?: number;
  /** Stream mode only: hard cap for the whole stream. Default 120s. */
  streamTimeoutMs?: number;
  /** Passed through to the AI SDK (e.g. `{ google: { thinkingConfig: { thinkingLevel: 'low' } } }`). */
  providerOptions?: ProviderOptions;
}

export interface LlmCallMeta {
  provider: ProviderKey;
  model: string;
  /** Token usage of the successful attempt. */
  usage: LlmUsage;
  /** Wall time of the whole runLLM call, including failed attempts. */
  latencyMs: number;
  /** Attempts made before the successful one (fallbacks + repair). */
  retries: number;
  /** Estimated cost summed over all attempts. */
  costUsd: number;
}

export interface LlmObjectResult<T> extends LlmCallMeta {
  object: T;
}

export interface LlmTextResult extends LlmCallMeta {
  text: string;
}

export interface LlmObjectStreamResult<T> {
  /** Provider the stream is committed to (the first token has already arrived). */
  provider: ProviderKey;
  model: string;
  /** Partial objects parsed from the streamed JSON (not validated). Single consumer. */
  partialObjectStream: AsyncIterable<DeepPartial<T>>;
  /** Final zod-validated object (after at most one repair retry). Rejects with LlmError. */
  final: Promise<LlmObjectResult<T>>;
}

export interface LlmTextStreamResult {
  provider: ProviderKey;
  model: string;
  /** Text deltas. Single consumer. */
  textStream: AsyncIterable<string>;
  final: Promise<LlmTextResult>;
}

export function runLLM<S extends z.ZodType>(
  opts: RunLLMBaseOptions & { schema: S; stream: true },
): Promise<LlmObjectStreamResult<z.output<S>>>;
export function runLLM<S extends z.ZodType>(
  opts: RunLLMBaseOptions & { schema: S; stream?: false },
): Promise<LlmObjectResult<z.output<S>>>;
export function runLLM(opts: RunLLMBaseOptions & { schema?: undefined; stream: true }): Promise<LlmTextStreamResult>;
export function runLLM(opts: RunLLMBaseOptions & { schema?: undefined; stream?: false }): Promise<LlmTextResult>;
export function runLLM(
  opts: RunLLMBaseOptions & { schema?: z.ZodType; stream?: boolean },
): Promise<LlmObjectResult<unknown> | LlmTextResult | LlmObjectStreamResult<unknown> | LlmTextStreamResult> {
  const ctx = createContext(opts);
  if (opts.stream) return runStream(ctx, opts.schema);
  return runGenerate(ctx, opts.schema);
}

// ───────────────────────────── context & logging ─────────────────────────────

interface RunContext {
  opts: RunLLMBaseOptions;
  sink: LlmCallSink;
  order: ProviderKey[];
  startedAt: number;
  attemptCount: number;
  totalCost: number;
  attempts: LlmAttemptSummary[];
  failures: ClassifiedError[];
  timeoutMs: number;
}

function createContext(opts: RunLLMBaseOptions): RunContext {
  const claudeEnabled = opts.providers.claudeEnabled === true && opts.providers.claude != null;
  return {
    opts,
    sink: opts.sink ?? noopSink,
    order: pickProviderOrder({ plan: opts.plan, country: opts.country, claudeEnabled }),
    startedAt: Date.now(),
    attemptCount: 0,
    totalCost: 0,
    attempts: [],
    failures: [],
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

function normUsage(u: LanguageModelUsage | undefined): LlmUsage {
  return { inputTokens: u?.inputTokens ?? null, outputTokens: u?.outputTokens ?? null };
}

const NO_USAGE: LlmUsage = { inputTokens: null, outputTokens: null };

function recordAttempt(
  ctx: RunContext,
  resolved: ResolvedModel,
  attemptIndex: number,
  startedAt: number,
  fields: { usage: LlmUsage; schemaValid: boolean | null; errorCode: string | null },
): void {
  const cost = estimateCost(resolved.provider, resolved.modelId, fields.usage);
  ctx.totalCost += cost;
  ctx.attempts.push({ provider: resolved.provider, model: resolved.modelId, errorCode: fields.errorCode });
  safeRecord(ctx.sink, {
    feature: ctx.opts.task,
    provider: resolved.provider,
    model: resolved.modelId,
    prompt_version: ctx.opts.promptVersion,
    input_tokens: fields.usage.inputTokens,
    output_tokens: fields.usage.outputTokens,
    latency_ms: Math.max(0, Date.now() - startedAt),
    cost_usd: cost,
    schema_valid: fields.schemaValid,
    retries: attemptIndex,
    error_code: fields.errorCode,
    user_id: ctx.opts.userId ?? null,
  });
}

function meta(ctx: RunContext, resolved: ResolvedModel, usage: LlmUsage, attemptIndex: number): LlmCallMeta {
  return {
    provider: resolved.provider,
    model: resolved.modelId,
    usage,
    latencyMs: Date.now() - ctx.startedAt,
    retries: attemptIndex,
    costUsd: Math.round(ctx.totalCost * 1e6) / 1e6,
  };
}

/** Error thrown when the provider loop is exhausted. */
function exhaustedError(ctx: RunContext, anyConfigured: boolean): LlmError {
  const last = ctx.attempts.at(-1);
  if (!anyConfigured) {
    return new LlmError('bad_config', `No configured provider for route [${ctx.order.join(', ')}]`, {
      attempts: ctx.attempts,
    });
  }
  const allTimeouts = ctx.failures.length > 0 && ctx.failures.every((f) => f.timeout);
  return new LlmError(allTimeouts ? 'timeout' : 'busy', 'All LLM providers failed or are rate-limited', {
    provider: last?.provider,
    attempts: ctx.attempts,
  });
}

function nonRetryableError(ctx: RunContext, resolved: ResolvedModel, c: ClassifiedError, cause: unknown): LlmError {
  const code: LlmErrorCode = c.badConfig ? 'bad_config' : 'provider_error';
  return new LlmError(code, `LLM provider error (${resolved.provider}: ${c.errorCode})`, {
    provider: resolved.provider,
    attempts: ctx.attempts,
    cause,
  });
}

function schemaInvalidError(ctx: RunContext, resolved: ResolvedModel, errors: string): LlmError {
  return new LlmError('schema_invalid', `LLM output failed schema validation after repair:\n${errors}`, {
    provider: resolved.provider,
    attempts: ctx.attempts,
  });
}

// ───────────────────────────── timeouts ─────────────────────────────

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new LlmTimeoutError(ms);
      ac.abort(err);
      reject(err);
    }, ms);
  });
  const work = fn(ac.signal);
  work.catch(() => {}); // the race loser must not become an unhandled rejection
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────────── single generate attempt ─────────────────────────────

type Input = { prompt: string } | { messages: ModelMessage[] };

type AttemptOutcome<T> =
  | { kind: 'ok'; value: T; usage: LlmUsage; attemptIndex: number }
  | { kind: 'invalid'; text: string; errors: string; usage: LlmUsage; attemptIndex: number }
  | { kind: 'error'; error: unknown; classified: ClassifiedError; attemptIndex: number };

function baseCallOptions(ctx: RunContext, resolved: ResolvedModel, signal: AbortSignal) {
  const o = ctx.opts;
  return {
    model: resolved.model,
    instructions: o.system,
    temperature: o.temperature,
    maxOutputTokens: o.maxOutputTokens,
    providerOptions: o.providerOptions,
    maxRetries: 0, // fallback/retry policy is ours, not the SDK's
    abortSignal: signal,
  };
}

async function attemptStructured<S extends z.ZodType>(
  ctx: RunContext,
  resolved: ResolvedModel,
  input: Input,
  schema: S,
): Promise<AttemptOutcome<z.output<S>>> {
  const attemptIndex = ctx.attemptCount++;
  const started = Date.now();
  let text = '';
  let usage = NO_USAGE;
  try {
    const res = await withTimeout(ctx.timeoutMs, (signal) =>
      generateText({
        ...baseCallOptions(ctx, resolved, signal),
        ...input,
        output: Output.object({ schema: schema as unknown as FlexibleSchema<z.output<S>> }),
      }),
    );
    usage = normUsage(res.usage);
    text = res.text;
    let value: z.output<S> | undefined;
    try {
      value = res.output;
    } catch {
      value = undefined; // NoOutputGeneratedError (e.g. finish reason `length`): try lenient parse below
    }
    if (value !== undefined) {
      recordAttempt(ctx, resolved, attemptIndex, started, { usage, schemaValid: true, errorCode: null });
      return { kind: 'ok', value, usage, attemptIndex };
    }
  } catch (e) {
    if (!NoObjectGeneratedError.isInstance(e)) {
      const classified = classifyError(e);
      recordAttempt(ctx, resolved, attemptIndex, started, {
        usage: NO_USAGE,
        schemaValid: null,
        errorCode: classified.errorCode,
      });
      return { kind: 'error', error: e, classified, attemptIndex };
    }
    usage = normUsage(e.usage);
    text = e.text ?? '';
  }
  // The SDK's strict parse failed. Try a lenient parse (fences / surrounding prose) before repairing.
  const parsed = parseWithSchema(text, schema);
  if (parsed.ok) {
    recordAttempt(ctx, resolved, attemptIndex, started, { usage, schemaValid: true, errorCode: null });
    return { kind: 'ok', value: parsed.value, usage, attemptIndex };
  }
  recordAttempt(ctx, resolved, attemptIndex, started, { usage, schemaValid: false, errorCode: 'schema_invalid' });
  return { kind: 'invalid', text, errors: parsed.errors, usage, attemptIndex };
}

async function attemptText(ctx: RunContext, resolved: ResolvedModel, input: Input): Promise<AttemptOutcome<string>> {
  const attemptIndex = ctx.attemptCount++;
  const started = Date.now();
  try {
    const res = await withTimeout(ctx.timeoutMs, (signal) =>
      generateText({ ...baseCallOptions(ctx, resolved, signal), ...input }),
    );
    const usage = normUsage(res.usage);
    recordAttempt(ctx, resolved, attemptIndex, started, { usage, schemaValid: null, errorCode: null });
    return { kind: 'ok', value: res.text, usage, attemptIndex };
  } catch (e) {
    const classified = classifyError(e);
    recordAttempt(ctx, resolved, attemptIndex, started, {
      usage: NO_USAGE,
      schemaValid: null,
      errorCode: classified.errorCode,
    });
    return { kind: 'error', error: e, classified, attemptIndex };
  }
}

function repairInput(prompt: string, badText: string, errors: string): Input {
  return {
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: badText },
      { role: 'user', content: buildRepairMessage(errors) },
    ],
  };
}

/**
 * Runs the repair retry on the same provider after an invalid structured output.
 * Returns the success outcome, throws schema_invalid / non-retryable errors, or returns null
 * when the repair hit a retryable error (caller falls back to the next provider).
 */
async function repairOnProvider<S extends z.ZodType>(
  ctx: RunContext,
  resolved: ResolvedModel,
  schema: S,
  badText: string,
  errors: string,
): Promise<Extract<AttemptOutcome<z.output<S>>, { kind: 'ok' }> | null> {
  const second = await attemptStructured(ctx, resolved, repairInput(ctx.opts.prompt, badText, errors), schema);
  if (second.kind === 'ok') return second;
  if (second.kind === 'invalid') throw schemaInvalidError(ctx, resolved, second.errors);
  if (!second.classified.retryable) throw nonRetryableError(ctx, resolved, second.classified, second.error);
  ctx.failures.push(second.classified);
  return null;
}

// ───────────────────────────── non-stream ─────────────────────────────

async function runGenerate(ctx: RunContext, schema: z.ZodType | undefined): Promise<LlmObjectResult<unknown> | LlmTextResult> {
  let anyConfigured = false;
  for (const key of ctx.order) {
    const resolved = resolveModel(key, ctx.opts.providers);
    if (!resolved) continue;
    anyConfigured = true;

    if (!schema) {
      const r = await attemptText(ctx, resolved, { prompt: ctx.opts.prompt });
      if (r.kind === 'ok') return { text: r.value, ...meta(ctx, resolved, r.usage, r.attemptIndex) };
      if (r.kind === 'error') {
        if (!r.classified.retryable) throw nonRetryableError(ctx, resolved, r.classified, r.error);
        ctx.failures.push(r.classified);
      }
      continue;
    }

    const first = await attemptStructured(ctx, resolved, { prompt: ctx.opts.prompt }, schema);
    if (first.kind === 'ok') return { object: first.value, ...meta(ctx, resolved, first.usage, first.attemptIndex) };
    if (first.kind === 'error') {
      if (!first.classified.retryable) throw nonRetryableError(ctx, resolved, first.classified, first.error);
      ctx.failures.push(first.classified);
      continue;
    }
    const repaired = await repairOnProvider(ctx, resolved, schema, first.text, first.errors);
    if (repaired) return { object: repaired.value, ...meta(ctx, resolved, repaired.usage, repaired.attemptIndex) };
  }
  throw exhaustedError(ctx, anyConfigured);
}

// ───────────────────────────── stream ─────────────────────────────

/** Minimal single-consumer async queue used to decouple the pump from the consumer. */
class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: Array<(r: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const w = this.waiters.shift();
    if (w) w({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ value: item, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: () => {
        this.items = [];
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}

interface StreamState {
  text: string;
  usage: LanguageModelUsage | undefined;
}

type StreamPart = { type: string; text?: string; error?: unknown; totalUsage?: LanguageModelUsage; usage?: LanguageModelUsage };

/** Applies one stream part to the state. Returns the text delta (or null). Throws on error/abort parts. */
function applyPart(part: StreamPart, st: StreamState): string | null {
  switch (part.type) {
    case 'text-delta':
      if (part.text) {
        st.text += part.text;
        return part.text;
      }
      return null;
    case 'finish-step':
      st.usage = part.usage ?? st.usage;
      return null;
    case 'finish':
      st.usage = part.totalUsage ?? st.usage;
      return null;
    case 'error':
      throw part.error;
    case 'abort':
      throw new LlmTimeoutError(-1);
    default:
      return null;
  }
}

async function runStream(
  ctx: RunContext,
  schema: z.ZodType | undefined,
): Promise<LlmObjectStreamResult<unknown> | LlmTextStreamResult> {
  const streamTimeoutMs = ctx.opts.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;
  let anyConfigured = false;

  for (const key of ctx.order) {
    const resolved = resolveModel(key, ctx.opts.providers);
    if (!resolved) continue;
    anyConfigured = true;

    const attemptIndex = ctx.attemptCount++;
    const started = Date.now();
    const ac = new AbortController();
    const totalTimer = setTimeout(() => ac.abort(new LlmTimeoutError(streamTimeoutMs)), streamTimeoutMs);
    const base = baseCallOptions(ctx, resolved, ac.signal);
    const result = schema
      ? streamText({
          ...base,
          prompt: ctx.opts.prompt,
          output: Output.object({ schema: schema as unknown as FlexibleSchema<unknown> }),
          onError: () => {}, // errors are read from the stream parts below
        })
      : streamText({ ...base, prompt: ctx.opts.prompt, onError: () => {} });
    const reader = (result.stream as ReadableStream<StreamPart>).getReader();
    const st: StreamState = { text: '', usage: undefined };
    let streamDone = false;

    // Phase 1: wait for the first token. Failures here fall back to the next provider.
    try {
      await withTimeout(ctx.timeoutMs, async () => {
        while (st.text === '') {
          const { done, value } = await reader.read();
          if (done) {
            streamDone = true;
            return;
          }
          applyPart(value, st);
        }
      });
    } catch (e) {
      clearTimeout(totalTimer);
      ac.abort();
      reader.cancel().catch(() => {});
      const classified = classifyError(e);
      recordAttempt(ctx, resolved, attemptIndex, started, {
        usage: NO_USAGE,
        schemaValid: null,
        errorCode: classified.errorCode,
      });
      if (!classified.retryable) throw nonRetryableError(ctx, resolved, classified, e);
      ctx.failures.push(classified);
      continue;
    }

    // Phase 2: committed to this provider. Pump the rest in the background.
    const queue = new AsyncQueue<unknown>();
    let lastPartialJson = '';
    const emitPartial = async () => {
      if (!schema) return;
      const { value, state } = await parsePartialJson(st.text);
      if ((state === 'successful-parse' || state === 'repaired-parse') && value !== null && typeof value === 'object') {
        const json = JSON.stringify(value);
        if (json !== lastPartialJson) {
          lastPartialJson = json;
          queue.push(value);
        }
      }
    };

    const final = (async (): Promise<LlmObjectResult<unknown> | LlmTextResult> => {
      try {
        if (schema) await emitPartial();
        else if (st.text) queue.push(st.text);
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          const delta = applyPart(value, st);
          if (delta !== null) {
            if (schema) await emitPartial();
            else queue.push(delta);
          }
        }
      } catch (e) {
        const classified = classifyError(e);
        recordAttempt(ctx, resolved, attemptIndex, started, {
          usage: normUsage(st.usage),
          schemaValid: null,
          errorCode: classified.errorCode,
        });
        throw new LlmError(classified.timeout ? 'timeout' : 'provider_error', 'LLM stream failed mid-way', {
          provider: resolved.provider,
          attempts: ctx.attempts,
          cause: e,
        });
      } finally {
        clearTimeout(totalTimer);
        queue.close();
      }

      const usage = normUsage(st.usage);
      if (!schema) {
        recordAttempt(ctx, resolved, attemptIndex, started, { usage, schemaValid: null, errorCode: null });
        return { text: st.text, ...meta(ctx, resolved, usage, attemptIndex) };
      }
      const parsed = parseWithSchema(st.text, schema);
      if (parsed.ok) {
        recordAttempt(ctx, resolved, attemptIndex, started, { usage, schemaValid: true, errorCode: null });
        return { object: parsed.value, ...meta(ctx, resolved, usage, attemptIndex) };
      }
      recordAttempt(ctx, resolved, attemptIndex, started, { usage, schemaValid: false, errorCode: 'schema_invalid' });
      // Repair as a non-stream call on the same provider; the final event carries the fixed object.
      const repaired = await repairOnProvider(ctx, resolved, schema, st.text, parsed.errors);
      if (repaired) return { object: repaired.value, ...meta(ctx, resolved, repaired.usage, repaired.attemptIndex) };
      throw new LlmError('busy', 'LLM provider became unavailable during schema repair', {
        provider: resolved.provider,
        attempts: ctx.attempts,
      });
    })();
    final.catch(() => {}); // callers may only consume the stream; never leak an unhandled rejection

    if (schema) {
      return {
        provider: resolved.provider,
        model: resolved.modelId,
        partialObjectStream: queue as AsyncIterable<DeepPartial<unknown>>,
        final: final as Promise<LlmObjectResult<unknown>>,
      };
    }
    return {
      provider: resolved.provider,
      model: resolved.modelId,
      textStream: queue as AsyncIterable<string>,
      final: final as Promise<LlmTextResult>,
    };
  }
  throw exhaustedError(ctx, anyConfigured);
}
