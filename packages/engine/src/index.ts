export type {
  PrimitiveValue,
  Value,
  LocalVar,
  StackFrame,
  FieldSlot,
  HeapObject,
  VTableSlot,
  ITableEntry,
  KlassInfo,
  Region,
  OperationType,
  ArrowEndpoint,
  Arrow,
  HighlightTarget,
  Delta,
  Step,
} from './types.js';

export type { TraceEntry } from './traces/index.js';
export { traces } from './traces/index.js';

// ── Language runners ──────────────────────────────────────────────────────────
// These are intentionally separate from the example trace exports.
// The renderer imports them only through the Web Worker, never directly.
export { runJava }   from './languages/java/index.js';
export type { TraceResult, InterpreterError } from './languages/java/interpreter.js';

