/**
 * packages/renderer/src/workers/interpreter.worker.ts
 *
 * Web Worker that runs the Java interpreter off the main thread.
 * Main thread sends: { source: string; lang: 'java' }
 * Worker replies with: TraceResult
 *
 * If the interpreter exceeds WORKER_TIMEOUT_MS the worker is terminated
 * by the main thread (see useInterpreter hook).
 */
import { runJava } from '@jvm-viz/engine/languages/java';
import type { TraceResult } from '@jvm-viz/engine/languages/java';

self.onmessage = (e: MessageEvent<{ source: string; lang: string }>) => {
  const { source, lang } = e.data;
  let result: TraceResult;

  if (lang === 'java') {
    result = runJava(source);
  } else {
    result = { steps: [], error: { kind: 'runtime_error', message: `Language "${lang}" is not yet supported` } };
  }

  self.postMessage(result);
};
