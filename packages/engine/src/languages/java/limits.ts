/**
 * engine/languages/java/limits.ts
 * Safety constants that bound interpreter execution.
 * All limits are checked at runtime and produce typed ExecutionErrors —
 * they NEVER throw unhandled exceptions into the main thread.
 */
export const LIMITS = {
  /** Maximum number of Step[] entries before we halt. Prevents infinite loops. */
  MAX_STEPS:        500,

  /** Maximum live heap objects (distinct objectIds) at any point. */
  MAX_HEAP_OBJECTS:  50,

  /** Maximum concurrent stack frames (depth). StackOverflow trigger. */
  MAX_STACK_DEPTH:   20,

  /** Maximum iterations of any single loop construct. */
  MAX_LOOP_ITERS:   200,

  /** Worker wall-clock timeout in ms. If exceeded, worker is terminated. */
  WORKER_TIMEOUT_MS: 4000,
} as const;
