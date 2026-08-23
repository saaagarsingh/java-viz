/**
 * useInterpreter — hook that manages the Web Worker lifecycle.
 * - Creates a worker on mount, terminates on unmount.
 * - On run(), sends source to worker and wires the result into the Zustand store.
 * - If the worker takes > WORKER_TIMEOUT_MS, terminates it and surfaces an error.
 */
import { useRef, useCallback, useEffect } from 'react';
import { useTraceStore }  from '../store/trace.store.js';
import type { TraceResult } from '@jvm-viz/engine/languages/java';
import type { ThreadSteppingState } from '@jvm-viz/engine';

type WorkerRequest =
  | { type: 'run'; source: string; lang: string }
  | { type: 'runThreadSession'; source: string; lang: string }
  | { type: 'stepThread'; threadId: string }
  | { type: 'drainThreads' };

type WorkerResponse =
  | { type: 'result'; result: TraceResult }
  | { type: 'sessionResult'; result: TraceResult; pendingThreads: string[] }
  | { type: 'stepResult'; result: ThreadSteppingState }
  | { type: 'error'; error: TraceResult['error'] };

// Inline the limits needed on the main thread — avoids a deep engine subpath import.
const WORKER_TIMEOUT_MS = 4_000;
const STEP_LIMIT        = 500;

export function useInterpreter() {
  const workerRef  = useRef<Worker | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setRunning, setResult, setSessionResult, lang } = useTraceStore();

  // Spin up the worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/interpreter.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const msg = e.data;
      if (msg.type === 'result') {
        setResult(msg.result.steps, msg.result.error);
        return;
      }
      if (msg.type === 'sessionResult') {
        setSessionResult(msg.result.steps, msg.result.error, msg.pendingThreads);
        return;
      }
      if (msg.type === 'stepResult') {
        setSessionResult(msg.result.steps, msg.result.error, msg.result.pendingThreads);
        return;
      }
      if (msg.type === 'error') {
        setResult([], msg.error);
      }
    };
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const run = useCallback((source: string) => {
    if (!workerRef.current) return;
    setRunning();

    // Safety: kill the worker if it runs too long
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      workerRef.current?.terminate();
      // Re-create for next run
      workerRef.current = new Worker(
        new URL('../workers/interpreter.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'result') {
          setResult(msg.result.steps, msg.result.error);
          return;
        }
        if (msg.type === 'error') {
          setResult([], msg.error);
          return;
        }
        if (msg.type === 'sessionResult') {
          setSessionResult(msg.result.steps, msg.result.error, msg.pendingThreads);
          return;
        }
        if (msg.type === 'stepResult') {
          setSessionResult(msg.result.steps, msg.result.error, msg.result.pendingThreads);
        }
      };
      setResult([], { kind: 'step_limit', limit: STEP_LIMIT });
    }, WORKER_TIMEOUT_MS);

    const payload: WorkerRequest = { type: 'run', source, lang };
    workerRef.current.postMessage(payload);
  }, [lang, setRunning, setResult, setSessionResult]);

  const runThreadSession = useCallback((source: string) => {
    if (!workerRef.current) return;
    setRunning();

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      workerRef.current?.terminate();
      workerRef.current = new Worker(
        new URL('../workers/interpreter.worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'result') {
          setResult(msg.result.steps, msg.result.error);
          return;
        }
        if (msg.type === 'error') {
          setResult([], msg.error);
          return;
        }
        if (msg.type === 'sessionResult') {
          setSessionResult(msg.result.steps, msg.result.error, msg.pendingThreads);
          return;
        }
        if (msg.type === 'stepResult') {
          setSessionResult(msg.result.steps, msg.result.error, msg.result.pendingThreads);
        }
      };
      setResult([], { kind: 'step_limit', limit: STEP_LIMIT });
    }, WORKER_TIMEOUT_MS);

    const payload: WorkerRequest = { type: 'runThreadSession', source, lang };
    workerRef.current.postMessage(payload);
  }, [lang, setRunning, setResult, setSessionResult]);

  const stepThread = useCallback((threadId: string) => {
    if (!workerRef.current) return;
    const payload: WorkerRequest = { type: 'stepThread', threadId };
    workerRef.current.postMessage(payload);
  }, []);

  const drainThreads = useCallback(() => {
    if (!workerRef.current) return;
    const payload: WorkerRequest = { type: 'drainThreads' };
    workerRef.current.postMessage(payload);
  }, []);

  return { run, runThreadSession, stepThread, drainThreads };
}
