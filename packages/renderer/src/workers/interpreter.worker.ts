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
import { runJava, runJavaThreadSession } from '@jvm-viz/engine/languages/java';
import type { TraceResult } from '@jvm-viz/engine/languages/java';
import type { ThreadExecutionSession, ThreadSteppingState } from '@jvm-viz/engine';

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

let threadSession: ThreadExecutionSession | null = null;

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'run') {
    threadSession = null;
    let result: TraceResult;
    if (msg.lang === 'java') {
      result = runJava(msg.source);
    } else {
      result = {
        steps: [],
        error: { kind: 'runtime_error', message: `Language "${msg.lang}" is not yet supported` },
      };
    }

    const payload: WorkerResponse = { type: 'result', result };
    self.postMessage(payload);
    return;
  }

  if (msg.type === 'runThreadSession') {
    threadSession = null;
    if (msg.lang !== 'java') {
      const payload: WorkerResponse = {
        type: 'error',
        error: { kind: 'runtime_error', message: `Language "${msg.lang}" is not yet supported` },
      };
      self.postMessage(payload);
      return;
    }

    const sessionOrErr = runJavaThreadSession(msg.source);
    if ('error' in sessionOrErr) {
      const payload: WorkerResponse = { type: 'error', error: sessionOrErr.error };
      self.postMessage(payload);
      return;
    }

    threadSession = sessionOrErr;
    const payload: WorkerResponse = {
      type: 'sessionResult',
      result: threadSession.initial,
      pendingThreads: threadSession.pendingThreads(),
    };
    self.postMessage(payload);
    return;
  }

  if (!threadSession) {
    const payload: WorkerResponse = {
      type: 'error',
      error: { kind: 'runtime_error', message: 'No active thread session. Run program first.' },
    };
    self.postMessage(payload);
    return;
  }

  if (msg.type === 'stepThread') {
    const result = threadSession.stepThread(msg.threadId);
    const payload: WorkerResponse = { type: 'stepResult', result };
    self.postMessage(payload);
    return;
  }

  if (msg.type === 'drainThreads') {
    const result = threadSession.drain();
    const payload: WorkerResponse = { type: 'stepResult', result };
    self.postMessage(payload);
  }
};
