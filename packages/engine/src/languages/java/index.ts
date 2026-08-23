/**
 * engine/languages/java/index.ts
 * Public API: takes source string, returns TraceResult.
 * This is what the Web Worker calls.
 */
import type { TraceResult, InterpreterError, ThreadDirective, ThreadExecutionSession } from './interpreter.js';
import { parseJava, ParseError }              from './parser.js';
import { interpret, createThreadExecutionSession } from './interpreter.js';

export type { TraceResult, InterpreterError } from './interpreter.js';

interface RawThreadDirective {
  threadId: string;
  line: number;
  runSource: string;
}

function extractThreadDirectives(source: string): RawThreadDirective[] {
  const directives: RawThreadDirective[] = [];
  const lines = source.split(/\r?\n/);
  const re = /^\s*\/\/\s*@thread\s+"([^"]+)"\s*\{\s*run:\s*(.+?)\s*\}\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const m = line.match(re);
    if (!m) continue;

    directives.push({
      threadId: m[1]!,
      line: i + 1,
      runSource: m[2]!,
    });
  }

  return directives;
}

function validateThreadDirectives(directives: RawThreadDirective[]) {
  const seen = new Map<string, number>();

  for (const d of directives) {
    if (d.threadId === 'main') {
      throw new ParseError('Invalid @thread id "main" (reserved thread id)', d.line);
    }
    const firstLine = seen.get(d.threadId);
    if (firstLine !== undefined) {
      throw new ParseError(`Duplicate @thread id "${d.threadId}" (first declared at line ${firstLine})`, d.line);
    }
    seen.set(d.threadId, d.line);
  }
}

function parseThreadRunExpr(runSource: string, line: number): ThreadDirective['runExpr'] {
  const wrapped = `class __ThreadDsl__ { static void __run__() { ${runSource}; } }`;
  const program = parseJava(wrapped);
  const klass = program.classes.find(c => c.name === '__ThreadDsl__');
  const method = klass?.methods.find(m => m.name === '__run__' && m.isStatic);
  const stmt = method?.body?.[0];

  if (!stmt || stmt.kind !== 'ExprStmt') {
    throw new ParseError(`Invalid @thread run expression at line ${line}`, line);
  }

  return stmt.expr;
}

export function runJava(source: string): TraceResult {
  try {
    const rawDirectives = extractThreadDirectives(source);
    validateThreadDirectives(rawDirectives);
    const threadDirectives: ThreadDirective[] = rawDirectives.map((d) => ({
      threadId: d.threadId,
      line: d.line,
      runExpr: parseThreadRunExpr(d.runSource, d.line),
    }));

    const program = parseJava(source);
    return interpret(program, { threadDirectives });
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

export function runJavaThreadSession(source: string): ThreadExecutionSession | { error: InterpreterError } {
  try {
    const rawDirectives = extractThreadDirectives(source);
    validateThreadDirectives(rawDirectives);
    const threadDirectives: ThreadDirective[] = rawDirectives.map((d) => ({
      threadId: d.threadId,
      line: d.line,
      runExpr: parseThreadRunExpr(d.runSource, d.line),
    }));

    const program = parseJava(source);
    return createThreadExecutionSession(program, { threadDirectives });
  } catch (e: any) {
    if (e?.name === 'UnsupportedError') {
      return { error: { kind: 'unsupported_syntax', feature: e.feature ?? e.message, line: e.line ?? null } };
    }
    if (e?.name === 'ParseError') {
      return { error: { kind: 'parse_error', message: e.message, line: e.line ?? null } };
    }
    return { error: { kind: 'runtime_error', message: String(e?.message ?? e) } };
  }
}
