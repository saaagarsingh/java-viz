/**
 * engine/languages/java/index.ts
 * Public API: takes source string, returns TraceResult.
 * This is what the Web Worker calls.
 */
import type { TraceResult, InterpreterError } from './interpreter.js';
import { parseJava, ParseError }              from './parser.js';
import { interpret }                           from './interpreter.js';

export type { TraceResult, InterpreterError } from './interpreter.js';

export function runJava(source: string): TraceResult {
  try {
    const program = parseJava(source);
    return interpret(program);
  } catch (e: any) {
    if (e?.name === 'UnsupportedError') {
      return { steps: [], error: { kind: 'unsupported_syntax', feature: e.feature ?? e.message, line: e.line ?? null } };
    }
    if (e?.name === 'ParseError') {
      return { steps: [], error: { kind: 'parse_error', message: e.message, line: e.line ?? null } };
    }
    return { steps: [], error: { kind: 'runtime_error', message: String(e?.message ?? e) } };
  }
}
