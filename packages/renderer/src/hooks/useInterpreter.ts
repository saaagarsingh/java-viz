/**
 * useInterpreter — hook that manages the Web Worker lifecycle.
 * - Creates a worker on mount, terminates on unmount.
 * - On run(), sends source to worker and wires the result into the Zustand store.
 * - If the worker takes > WORKER_TIMEOUT_MS, terminates it and surfaces an error.
 */
import { useRef, useCallback, useEffect } from 'react';
import { useTraceStore }  from '../store/trace.store.js';
import type { TraceResult } from '@jvm-viz/engine/languages/java';

// Inline the limits needed on the main thread — avoids a deep engine subpath import.
const WORKER_TIMEOUT_MS = 4_000;
const STEP_LIMIT        = 500;

export function useInterpreter() {
  const workerRef  = useRef<Worker | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setRunning, setResult, lang } = useTraceStore();

  // Spin up the worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/interpreter.worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current.onmessage = (e: MessageEvent<TraceResult>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setResult(e.data.steps, e.data.error);
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
      workerRef.current.onmessage = (e: MessageEvent<TraceResult>) => {
        setResult(e.data.steps, e.data.error);
      };
      setResult([], { kind: 'step_limit', limit: STEP_LIMIT });
    }, WORKER_TIMEOUT_MS);

    workerRef.current.postMessage({ source, lang });
  }, [lang, setRunning, setResult]);

  return { run };
}
