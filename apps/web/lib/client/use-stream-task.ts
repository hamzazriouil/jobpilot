'use client';

// React hooks around postSse: one task (analyze or draft) at a time, abortable, with partial
// frames batched to one render per animation frame (models can emit dozens of frames a second).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnalyzeResultEvent,
  DraftResultEvent,
  type AnalyzeRequest,
  type DraftRequest,
} from '@jobpilot/core/schemas';
import { sanitizeAnalysisPartial, sanitizeDraftsPartial, type PartialAnalysis, type PartialDrafts } from './partial';
import { postSse, StreamError, type ResultSchema } from './stream';

export type StreamTaskState<P, R> =
  | { status: 'idle' }
  | { status: 'streaming'; partial: P | null }
  | { status: 'done'; partial: P | null; result: R }
  | { status: 'error'; partial: P | null; error: StreamError };

export interface StreamTask<B, P, R> {
  state: StreamTaskState<P, R>;
  /** Starts a run (aborting any run in flight). Resolves with the result, or null on error/abort. */
  start: (url: string, body: B) => Promise<R | null>;
  /** Stops the run in flight. The state becomes an `aborted` error that keeps the partial. */
  abort: () => void;
  /** Stops any run and returns to idle. */
  reset: () => void;
}

function useStreamTask<B, P, R>(resultSchema: ResultSchema<R>, sanitize: (raw: unknown) => P): StreamTask<B, P, R> {
  const [state, setState] = useState<StreamTaskState<P, R>>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const latestPartialRef = useRef<P | null>(null);
  const frameRef = useRef<number | null>(null);

  const cancelFrame = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const start = useCallback(
    async (url: string, body: B): Promise<R | null> => {
      controllerRef.current?.abort();
      cancelFrame();
      const controller = new AbortController();
      controllerRef.current = controller;
      const runId = ++runIdRef.current;
      const isCurrent = () => runId === runIdRef.current;
      latestPartialRef.current = null;
      setState({ status: 'streaming', partial: null });

      const onPartial = (raw: unknown) => {
        if (!isCurrent()) return;
        latestPartialRef.current = sanitize(raw);
        if (frameRef.current !== null) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          if (isCurrent()) setState({ status: 'streaming', partial: latestPartialRef.current });
        });
      };

      try {
        const result = await postSse(url, body, { resultSchema, onPartial, signal: controller.signal });
        if (!isCurrent()) return null;
        cancelFrame();
        setState({ status: 'done', partial: latestPartialRef.current, result });
        return result;
      } catch (err) {
        if (!isCurrent()) return null;
        cancelFrame();
        const error = err instanceof StreamError ? err : new StreamError('internal', 'Unexpected client error.');
        setState({ status: 'error', partial: latestPartialRef.current, error });
        return null;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [cancelFrame, resultSchema, sanitize],
  );

  const abort = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    runIdRef.current++;
    controllerRef.current?.abort();
    controllerRef.current = null;
    cancelFrame();
    setState({ status: 'idle' });
  }, [cancelFrame]);

  // Leaving the page stops the stream (and the server stops paying for tokens).
  useEffect(
    () => () => {
      runIdRef.current++;
      controllerRef.current?.abort();
      cancelFrame();
    },
    [cancelFrame],
  );

  return { state, start, abort, reset };
}

/** Body of POST /api/analyze as the client sends it (the server trims and validates). */
export type AnalyzeBody = Pick<AnalyzeRequest, 'cvText' | 'jobText' | 'country'>;
export type DraftBody = DraftRequest;

export type AnalyzeTask = StreamTask<AnalyzeBody, PartialAnalysis, AnalyzeResultEvent>;
export type DraftTask = StreamTask<DraftBody, PartialDrafts, DraftResultEvent>;

export function useAnalyzeStream(): AnalyzeTask {
  return useStreamTask<AnalyzeBody, PartialAnalysis, AnalyzeResultEvent>(AnalyzeResultEvent, sanitizeAnalysisPartial);
}

export function useDraftStream(): DraftTask {
  return useStreamTask<DraftBody, PartialDrafts, DraftResultEvent>(DraftResultEvent, sanitizeDraftsPartial);
}

/** POST /api/jobs/:id/analyze takes no body: CV, country and job come from the user's account. */
export type SavedAnalyzeBody = Record<string, never>;
/** POST /api/jobs/:id/draft */
export type SavedDraftBody = { analysisId: string };

export function useSavedAnalyzeStream(): StreamTask<SavedAnalyzeBody, PartialAnalysis, AnalyzeResultEvent> {
  return useStreamTask<SavedAnalyzeBody, PartialAnalysis, AnalyzeResultEvent>(AnalyzeResultEvent, sanitizeAnalysisPartial);
}

export function useSavedDraftStream(): StreamTask<SavedDraftBody, PartialDrafts, DraftResultEvent> {
  return useStreamTask<SavedDraftBody, PartialDrafts, DraftResultEvent>(DraftResultEvent, sanitizeDraftsPartial);
}
