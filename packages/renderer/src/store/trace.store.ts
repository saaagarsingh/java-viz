import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { traces } from '@jvm-viz/engine';
import type { Step } from '@jvm-viz/engine';

// ── Error types ───────────────────────────────────────────────────────────────

export type ExecutionError =
  | { kind: 'parse_error';        message: string; line: number | null }
  | { kind: 'unsupported_syntax'; feature: string; line: number | null }
  | { kind: 'stack_overflow';     maxDepth: number; frameCount: number }
  | { kind: 'out_of_memory';      limit: number;    objectCount: number }
  | { kind: 'step_limit';         limit: number }
  | { kind: 'null_pointer';       className: string; field: string; line: number | null }
  | { kind: 'division_by_zero';   line: number | null }
  | { kind: 'class_not_found';    name: string }
  | { kind: 'runtime_error';      message: string };

export type InterpreterStatus = 'idle' | 'running' | 'done' | 'error';
export type TraceMode = 'example' | 'custom';
export type SupportedLang = 'java';   // future: | 'python' | 'kotlin'

export type ToastState =
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string };

// ── Store shape ───────────────────────────────────────────────────────────────

interface TraceState {
  // Selection
  mode:        TraceMode;
  exampleIdx:  number;
  customSource: string;          // persisted
  lang:        SupportedLang;    // persisted

  // Execution
  status:     InterpreterStatus;
  steps:      Step[];
  error:      ExecutionError | null;
  stepIndex:  number;

  // Toast
  toast:       ToastState | null;  // shown until dismissed

  // Thread stepping (Phase 2)
  pendingThreads: string[];
  selectedThreadId: string | null;
}

interface TraceActions {
  // Navigation
  selectExample:  (idx: number) => void;
  setMode:        (mode: TraceMode) => void;
  setCustomSource:(src: string) => void;
  setStepIndex:   (i: number) => void;
  stepForward:    () => void;
  stepBack:       () => void;

  // Interpreter lifecycle (worker calls these)
  setRunning:     () => void;
  setResult:      (steps: Step[], error: ExecutionError | null) => void;
  setSessionResult: (steps: Step[], error: ExecutionError | null, pendingThreads: string[]) => void;
  setSelectedThreadId: (threadId: string | null) => void;

  // Toast
  dismissToast:   () => void;
  // Editing
  clearExecution: () => void;
}

export type TraceStore = TraceState & TraceActions;

// ── Derived helpers ───────────────────────────────────────────────────────────

export function errorSummary(e: ExecutionError): string {
  switch (e.kind) {
    case 'parse_error':        return `Parse error${e.line ? ` at line ${e.line}` : ''}: ${e.message}`;
    case 'unsupported_syntax': return `"${e.feature}" is not supported in this teaching subset${e.line ? ` (line ${e.line})` : ''}`;
    case 'stack_overflow':     return `StackOverflowError — stack depth limit (${e.maxDepth}) reached`;
    case 'out_of_memory':      return `OutOfMemoryError — heap object limit (${e.limit}) reached`;
    case 'step_limit':         return `Execution limit (${e.limit} steps) reached — program may be infinite`;
    case 'null_pointer':       return `NullPointerException — accessed field "${e.field}" on null ${e.className}`;
    case 'division_by_zero':   return `ArithmeticException: / by zero`;
    case 'class_not_found':    return `ClassNotFoundException: ${e.name} (only classes defined in the program are available)`;
    case 'runtime_error':      return e.message;
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

// We persist only the user-authored content and preferences.
// Execution results are always re-derived.
const PERSIST_KEYS: (keyof TraceState)[] = ['customSource', 'lang', 'mode'];

export const useTraceStore = create<TraceStore>()(
  persist(
    (set, get) => ({
      // ── initial state ────────────────────────────────────────────
      mode:         'example',
      exampleIdx:   -1,
      customSource: '',
      lang:         'java',

      status:    'idle',
      steps:     [],
      error:     null,
      stepIndex: 0,
      toast:     null,
      pendingThreads: [],
      selectedThreadId: null,

      // ── actions ──────────────────────────────────────────────────
      selectExample: (idx) => {
        const t = traces[idx];
        if (!t) {
          set({
            exampleIdx: -1,
            mode: 'example',
            status: 'idle',
            steps: [],
            error: null,
            stepIndex: 0,
            toast: null,
            pendingThreads: [],
            selectedThreadId: null,
          });
          return;
        }
        set({
          exampleIdx: idx,
          mode:       'example',
          steps:      t.steps,
          error:      null,
          stepIndex:  0,
          status:     'done',
          toast:      null,
          pendingThreads: [],
          selectedThreadId: null,
        });
      },

      setMode: (mode) => {
        if (mode === 'custom') {
          set({
            mode,
            status: 'idle',
            steps: [],
            error: null,
            stepIndex: 0,
            toast: null,
            pendingThreads: [],
            selectedThreadId: null,
          });
          return;
        }

        const idx = get().exampleIdx;
        const t = traces[idx];
        if (!t) {
          set({
            mode,
            status: 'idle',
            steps: [],
            error: null,
            stepIndex: 0,
            toast: null,
            pendingThreads: [],
            selectedThreadId: null,
          });
          return;
        }

        set({
          mode,
          steps: t.steps,
          error: null,
          stepIndex: 0,
          status: 'done',
          toast: null,
          pendingThreads: [],
          selectedThreadId: null,
        });
      },

      setCustomSource: (src) => set({
        customSource: src,
        // Editing the source invalidates the current trace
        status: 'idle', steps: [], error: null, stepIndex: 0, toast: null, pendingThreads: [], selectedThreadId: null,
      }),

      clearExecution: () => set({ status: 'idle', steps: [], error: null, stepIndex: 0, toast: null, pendingThreads: [], selectedThreadId: null }),

      setStepIndex: (i) => {
        const { steps } = get();
        set({ stepIndex: Math.max(0, Math.min(steps.length - 1, i)) });
      },

      stepForward: () => {
        const { stepIndex, steps } = get();
        if (stepIndex < steps.length - 1) set({ stepIndex: stepIndex + 1 });
      },

      stepBack: () => {
        const { stepIndex } = get();
        if (stepIndex > 0) set({ stepIndex: stepIndex - 1 });
      },

      setRunning: () => set({ status: 'running', error: null, toast: null, steps: [], stepIndex: 0, pendingThreads: [], selectedThreadId: null }),

      setResult: (steps, error) => {
        set({
          steps,
          error,
          stepIndex: 0,
          status:    error ? 'error' : 'done',
          toast:     error ? { kind: 'error', message: errorSummary(error) } : null,
          pendingThreads: [],
          selectedThreadId: null,
        });
      },

      setSessionResult: (steps, error, pendingThreads) => {
        const prevStatus = get().status;
        const prevPending = get().pendingThreads;
        const prevSelected = get().selectedThreadId;
        const selectedThreadId =
          prevSelected && pendingThreads.includes(prevSelected)
            ? prevSelected
            : (pendingThreads[0] ?? null);

        const spawned = pendingThreads.filter((tid) => !prevPending.includes(tid));
        let toast: ToastState | null = null;
        if (error) {
          toast = { kind: 'error', message: errorSummary(error) };
        } else if (spawned.length > 0) {
          const msg = spawned.length === 1
            ? `Thread spawned: ${spawned[0]}`
            : `Threads spawned: ${spawned.join(', ')}`;
          toast = { kind: 'success', message: msg };
        }

        set({
          steps,
          error,
          // Fresh runs should begin at the first snapshot; interactive thread stepping
          // keeps focus on the newest snapshot appended to the trace.
          stepIndex: prevStatus === 'running'
            ? 0
            : (steps.length > 0 ? steps.length - 1 : 0),
          status: error ? 'error' : 'done',
          toast,
          pendingThreads,
          selectedThreadId,
        });
      },

      setSelectedThreadId: (threadId) => set({ selectedThreadId: threadId }),

      dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'jvm-viz-trace',
      storage: createJSONStorage(() => localStorage),
      // Only persist user-authored content and preferences
      partialize: (state) =>
        Object.fromEntries(
          PERSIST_KEYS.map(k => [k, state[k]])
        ) as Partial<TraceState>,
    }
  )
);
