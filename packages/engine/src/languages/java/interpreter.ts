/**
 * engine/languages/java/interpreter.ts
 *
 * Tree-walking interpreter over our simplified AST.
 * Produces Step[] — the contract the renderer consumes.
 *
 * Execution model:
 *  - Runs synchronously (in a Web Worker so it can't block the UI).
 *  - Every Step is a complete immutable snapshot — the renderer is stateless per step.
 *  - Steps are emitted at semantic boundaries:
 *      new_object, method entry, method return, field write (putfield/putstatic),
 *      static init (<clinit>), vtable/itable lookup, println.
 *    Arithmetic, local variable reads, and control flow do NOT emit steps
 *    (they would create too many steps for even a trivial loop).
 *  - Safety: MAX_STEPS, MAX_HEAP_OBJECTS, MAX_STACK_DEPTH, MAX_LOOP_ITERS
 *    are checked eagerly and produce typed errors, not crashes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  Step, Value, StackFrame, HeapObject, KlassInfo,
  Arrow, Delta, HighlightTarget, OperationType, Region,
} from '../../types.js';
import type {
  Program, ClassDecl, MethodDecl, ConstructorDecl,
  Statement, Expr, SourceLoc,
} from './ast.js';
import type { LoadedClasses }  from './class-loader.js';
import { loadClasses, defaultValue } from './class-loader.js';
import { LIMITS } from './limits.js';

// ── Result & Error types ──────────────────────────────────────────────────────

export type InterpreterError =
  | { kind: 'parse_error';        message: string; line: number | null }
  | { kind: 'unsupported_syntax'; feature: string; line: number | null }
  | { kind: 'stack_overflow';     maxDepth: number; frameCount: number }
  | { kind: 'out_of_memory';      limit: number;    objectCount: number }
  | { kind: 'step_limit';         limit: number }
  | { kind: 'null_pointer';       className: string; field: string; line: number | null }
  | { kind: 'division_by_zero';   line: number | null }
  | { kind: 'class_not_found';    name: string }
  | { kind: 'runtime_error';      message: string };

export interface TraceResult {
  steps: Step[];
  error: InterpreterError | null;
}

// ── Runtime signals (non-error control flow) ──────────────────────────────────

class ReturnSignal {
  constructor(public readonly value: Value) {}
}

class BreakSignal    {}
class ContinueSignal {}

class InterpreterHalt {
  constructor(public readonly error: InterpreterError) {}
}

class ThreadBlocked {
  constructor(public readonly objectId: string) {}
}

// ── Runtime heap object ───────────────────────────────────────────────────────

interface RuntimeObject {
  objectId: string;
  klassName: string;
  fields:    Map<string, Value>;  // key = "ClassName.fieldName" for inherited disambiguation
}

// ── Runtime frame ─────────────────────────────────────────────────────────────

interface RuntimeFrame {
  frameId:     string;
  className:   string;
  methodName:  string;
  descriptor:  string;
  locals:      Map<string, Value>;
  currentLine: number | null;
}

export interface ThreadDirective {
  threadId: string;
  line: number;
  runExpr: Expr;
}

interface ThreadTask {
  kind: 'directive_expr' | 'thread_run';
  originLine: number;
  runExpr?: Expr;
  capturedLocals?: Map<string, Value>;
  threadObjectId?: string;
}

interface InterpretRunOptions {
  deferWorkerThreads?: boolean;
}

export interface ThreadSteppingState {
  steps: Step[];
  error: InterpreterError | null;
  pendingThreads: string[];
}

// ── Thread state (Phase 2) ─────────────────────────────────────────────────

interface ThreadState {
  threadId:     string;
  status:       'CREATED' | 'RUNNABLE' | 'WAITING_ON_LOCK' | 'WAITING_ON_THREAD' | 'TERMINATED';
  callStack:    RuntimeFrame[];
  nextFrameId:  number;  // per-thread frame ID counter
  waitingOn:    string | null;
  waitUntilTick: number | null;
  waitingLine:  number | null;
  tasks:        ThreadTask[];
}

interface ObjectLock {
  owner:       string | null;    // threadId holding the lock (null when released between handoff)
  depth:       number;           // reentrant lock depth (how many times locked by owner)
  waitQueue:   string[];         // threadIds waiting for this lock
  acquiredAt:  number;           // step index when first acquired
}

// ── Main interpreter class ────────────────────────────────────────────────────

export class JavaInterpreter {
  // Shared execution state (across all threads)
  private heap      = new Map<string, RuntimeObject>();
  private stdout:    string[] = [];
  private steps:     Step[]  = [];

  // Loaded class metadata
  private loaded!: LoadedClasses;
  // Mutable KlassInfo map (isInitialized changes at runtime)
  private klassState = new Map<string, KlassInfo>();

  // ID counters (shared across threads)
  private nextObjectId = 1;
  private nextArrowId = 1;

  // Arrow tracking: arrows that are currently visible
  private arrows: Arrow[] = [];

  // Phase 2: Thread management
  private threads:        Map<string, ThreadState> = new Map();
  private currentThreadId: string = 'main';
  private locks:          Map<string, ObjectLock> = new Map();  // objectId → lock info
  private threadOrder:    string[] = [];  // order to step through threads (for predictability)
  private threadDirectives: ThreadDirective[];
  private nextDirectiveIdx = 0;
  private haltedError: InterpreterError | null = null;
  private threadObjectToThreadId = new Map<string, string>();
  private threadDisplayNames = new Map<string, string>();
  private nextAutoThreadId = 1;
  private schedulerTick = 0;

  constructor(opts?: { threadDirectives?: ThreadDirective[] }) {
    const directives = opts?.threadDirectives ?? [];
    this.threadDirectives = [...directives].sort((a, b) => a.line - b.line);
  }

  // ── Entry point ────────────────────────────────────────────────────────────

  interpret(program: Program, opts?: InterpretRunOptions): TraceResult {
    try {
      this.haltedError = null;
      this.loaded = loadClasses(program);
      // Clone KlassInfo so we can mutate isInitialized safely
      for (const k of this.loaded.klasses) {
        this.klassState.set(k.klassName, { ...k, staticFields: k.staticFields.map(f => ({ ...f })) });
      }
      this.ensureBuiltinKlasses();

      // Emit Step 0: classes loaded, main about to run
      const mainClass  = this.findMainClass(program);
      const mainMethod = this.findMainMethod(mainClass);
      const mainFrame  = this.pushFrame(mainClass.name, 'main', mainMethod.params.map(p => p.name), [], mainMethod.loc.line);

      this.emitStep(mainFrame.currentLine, null);

      // Execute main
      this.ensureInitialized(mainClass.name, null);
      this.executeMethod(mainClass.name, mainMethod, []);

      this.popFrame();
      if (!opts?.deferWorkerThreads) {
        this.runSpawnedThreads();
      }
      return { steps: this.steps, error: null };

    } catch (e) {
      if (e instanceof InterpreterHalt) {
        this.haltedError = e.error;
        return { steps: this.steps, error: e.error };
      }
      if (e instanceof Error) {
        const err: InterpreterError = { kind: 'runtime_error', message: e.message };
        this.haltedError = err;
        return { steps: this.steps, error: err };
      }
      const err: InterpreterError = { kind: 'runtime_error', message: String(e) };
      this.haltedError = err;
      return { steps: this.steps, error: err };
    }
  }

  stepThreadOnce(threadId: string): ThreadSteppingState {
    if (this.haltedError) {
      return { steps: this.steps, error: this.haltedError, pendingThreads: this.pendingThreadIds() };
    }
    if (threadId === 'main') {
      return { steps: this.steps, error: null, pendingThreads: this.pendingThreadIds() };
    }

    try {
      this.executeThreadTask(threadId);
      return { steps: this.steps, error: null, pendingThreads: this.pendingThreadIds() };
    } catch (e) {
      if (e instanceof InterpreterHalt) {
        this.haltedError = e.error;
        return { steps: this.steps, error: e.error, pendingThreads: this.pendingThreadIds() };
      }
      if (e instanceof Error) {
        const err: InterpreterError = { kind: 'runtime_error', message: e.message };
        this.haltedError = err;
        return { steps: this.steps, error: err, pendingThreads: this.pendingThreadIds() };
      }
      const err: InterpreterError = { kind: 'runtime_error', message: String(e) };
      this.haltedError = err;
      return { steps: this.steps, error: err, pendingThreads: this.pendingThreadIds() };
    }
  }

  drainThreads(): ThreadSteppingState {
    if (this.haltedError) {
      return { steps: this.steps, error: this.haltedError, pendingThreads: this.pendingThreadIds() };
    }

    try {
      this.runSpawnedThreads();
      return { steps: this.steps, error: null, pendingThreads: this.pendingThreadIds() };
    } catch (e) {
      if (e instanceof InterpreterHalt) {
        this.haltedError = e.error;
        return { steps: this.steps, error: e.error, pendingThreads: this.pendingThreadIds() };
      }
      if (e instanceof Error) {
        const err: InterpreterError = { kind: 'runtime_error', message: e.message };
        this.haltedError = err;
        return { steps: this.steps, error: err, pendingThreads: this.pendingThreadIds() };
      }
      const err: InterpreterError = { kind: 'runtime_error', message: String(e) };
      this.haltedError = err;
      return { steps: this.steps, error: err, pendingThreads: this.pendingThreadIds() };
    }
  }

  pendingThreadIds(): string[] {
    return this.threadOrder.filter((tid) => {
      if (tid === 'main') return false;
      const t = this.threads.get(tid);
      return !!t && t.tasks.length > 0;
    });
  }

  // ── Class initialisation (<clinit>) ────────────────────────────────────────

  private ensureInitialized(className: string, callSiteLine: number | null) {
    const klass = this.klassState.get(className);
    if (!klass || klass.isInitialized) return;

    // Mark initialized immediately to prevent re-entrant init
    klass.isInitialized = true;

    const decl = this.loaded.decls.get(className);
    if (!decl) return;

    // Init superclass first
    if (decl.superclass && decl.superclass !== 'Object') {
      this.ensureInitialized(decl.superclass, callSiteLine);
    }

    // Evaluate static field initializers
    for (const field of decl.fields.filter(f => f.isStatic)) {
      if (field.initializer) {
        const value = this.evalExpr(field.initializer);
        this.setStaticField(className, field.name, value, field.loc.line);
      }
    }

    // Execute static init blocks
    if (decl.staticInitBlocks.length > 0) {
      const clinitFrame = this.pushFrame(className, '<clinit>', [], [], callSiteLine);
      for (const block of decl.staticInitBlocks) {
        this.executeStatements(block, callSiteLine);
      }
      this.popFrame();
    }

    // Emit step after clinit
    this.emitStep(callSiteLine, {
      operation: 'clinit',
      description: `<clinit> complete for ${className} — static fields initialised`,
      highlightedElements: [{ region: 'metaspace', elementId: className }],
      newArrows: [],
      fadingArrows: [],
    });
  }

  // ── Method execution ────────────────────────────────────────────────────────

  private executeMethod(className: string, method: MethodDecl, argValues: Value[]): Value {
    if (!method.body) {
      throw new InterpreterHalt({ kind: 'runtime_error', message: `Abstract method ${className}.${method.name} called` });
    }

    const frame = this.pushFrame(className, method.name,
      method.params.map(p => p.name), argValues, method.loc.line);

    this.emitStep(frame.currentLine, {
      operation:           (method.isStatic ? 'invokestatic' : 'invokevirtual') as OperationType,
      description:         `${method.isStatic ? 'invokestatic' : 'invokevirtual'} — entering ${className}.${method.name}()`,
      highlightedElements: [{ region: 'stack', elementId: frame.frameId }],
      newArrows: [],
      fadingArrows: [],
      methodInvoked: {
        klassName: className,
        methodName: method.name,
        frameId: frame.frameId,
        operationType: method.isStatic ? 'invokestatic' : 'invokevirtual',
      },
    });

    try {
      // Phase 2: Handle synchronized methods
      if (method.isSynchronized) {
        let lockObjectId: string;
        if (method.isStatic) {
          // Static method: lock on class (simplified: use className as lock key)
          lockObjectId = `klass:${className}`;
        } else {
          // Instance method: lock on this
          const thisRef = frame.locals.get('this');
          if (!thisRef || thisRef.kind !== 'ref') {
            throw new InterpreterHalt({ kind: 'null_pointer', className, field: 'this', line: method.loc.line });
          }
          lockObjectId = thisRef.objectId;
        }
        this.acquireMonitor(lockObjectId, this.currentThreadId, method.loc.line);
        const currentThread = this.getOrCreateThread(this.currentThreadId);
        if (currentThread.status === 'WAITING_ON_LOCK') {
          throw new ThreadBlocked(lockObjectId);
        }
        try {
          this.executeStatements(method.body, method.loc.line);
        } finally {
          this.releaseMonitor(lockObjectId, this.currentThreadId, method.loc.line);
        }
      } else {
        this.executeStatements(method.body, method.loc.line);
      }
    } catch (e) {
      if (e instanceof ReturnSignal) {
        this.popFrame();
        return e.value;
      }
      if (e instanceof ThreadBlocked) {
        this.popFrame();
      }
      throw e;
    }

    if (this.currentThreadId === 'main' && method.name === 'main') {
      // Capture directives that appear after the final executable statement.
      this.maybeSpawnThreadDirectives(Number.MAX_SAFE_INTEGER);
    }

    this.popFrame();

    this.emitStep(frame.currentLine, {
      operation: 'return',
      description: `return from ${className}.${method.name}()`,
      highlightedElements: [],
      newArrows: [],
      fadingArrows: [],
    });

    return { kind: 'uninitialized' };
  }

  private executeConstructor(className: string, ctor: ConstructorDecl, argValues: Value[], thisRef: Value): void {
    const frame = this.pushFrame(className, '<init>', ['this', ...ctor.params.map(p => p.name)], [thisRef, ...argValues], ctor.loc.line);

    this.emitStep(frame.currentLine, {
      operation: 'invokespecial',
      description: `invokespecial ${className}.<init> — constructor frame pushed`,
      highlightedElements: [{ region: 'stack', elementId: frame.frameId }],
      newArrows: [],
      fadingArrows: [],
      methodInvoked: {
        klassName: className,
        methodName: '<init>',
        frameId: frame.frameId,
        operationType: 'invokespecial',
      },
    });

    try {
      this.executeStatements(ctor.body, ctor.loc.line);
    } catch (e) {
      if (e instanceof ReturnSignal) { /* void return from ctor is fine */ }
      else throw e;
    }

    this.popFrame();

    this.emitStep(frame.currentLine, {
      operation: 'return',
      description: `return from ${className}.<init>`,
      highlightedElements: [],
      newArrows: [],
      fadingArrows: [],
    });
  }

  // ── Statement execution ────────────────────────────────────────────────────

  private executeStatements(stmts: Statement[], lineHint: number | null) {
    for (const stmt of stmts) this.executeStatement(stmt, lineHint);
  }

  private executeStatement(stmt: Statement, lineHint: number | null) {
    this.setCurrentLine(stmt.loc.line);
    this.checkStepLimit();
    this.maybeSpawnThreadDirectives(stmt.loc.line);

    switch (stmt.kind) {
      case 'LocalVarDecl': {
        const value = stmt.initializer ? this.evalExpr(stmt.initializer) : defaultValue(stmt.type);
        this.setLocal(stmt.name, value);
        break;
      }
      case 'ExprStmt':
        this.evalExpr(stmt.expr);
        break;
      case 'ReturnStmt': {
        const val = stmt.value ? this.evalExpr(stmt.value) : { kind: 'uninitialized' as const };
        throw new ReturnSignal(val);
      }
      case 'IfStmt': {
        const cond = this.evalExpr(stmt.condition);
        if (this.isTruthy(cond)) {
          this.executeStatements(stmt.then, stmt.loc.line);
        } else if (stmt.else_) {
          this.executeStatements(stmt.else_, stmt.loc.line);
        }
        break;
      }
      case 'ForStmt': {
        if (stmt.init) this.executeStatement(stmt.init, stmt.loc.line);
        let iters = 0;
        outer: while (true) {
          if (stmt.condition) {
            const cond = this.evalExpr(stmt.condition);
            if (!this.isTruthy(cond)) break;
          }
          if (++iters > LIMITS.MAX_LOOP_ITERS) {
            throw new InterpreterHalt({ kind: 'step_limit', limit: LIMITS.MAX_LOOP_ITERS });
          }
          try {
            this.executeStatements(stmt.body, stmt.loc.line);
          } catch (e) {
            if (e instanceof BreakSignal)    break outer;
            if (e instanceof ContinueSignal) { /* fall through to update */ }
            else throw e;
          }
          if (stmt.update) this.evalExpr(stmt.update.expr);
        }
        break;
      }
      case 'WhileStmt': {
        let iters = 0;
        while (true) {
          const cond = this.evalExpr(stmt.condition);
          if (!this.isTruthy(cond)) break;
          if (++iters > LIMITS.MAX_LOOP_ITERS) {
            throw new InterpreterHalt({ kind: 'step_limit', limit: LIMITS.MAX_LOOP_ITERS });
          }
          try {
            this.executeStatements(stmt.body, stmt.loc.line);
          } catch (e) {
            if (e instanceof BreakSignal)    break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        break;
      }
      case 'BreakStmt':
        throw new BreakSignal();
      case 'ContinueStmt':
        throw new ContinueSignal();
      case 'BlockStmt':
        this.executeStatements(stmt.statements, stmt.loc.line);
        break;
      case 'SynchronizedStmt': {
        // Phase 2: Synchronized block
        const obj = this.evalExpr(stmt.expr);
        if (obj.kind !== 'ref') {
          throw new InterpreterHalt({ kind: 'null_pointer', className: '(primitive)', field: 'synchronized', line: stmt.loc.line });
        }
        
        const objectId = obj.objectId;
        this.acquireMonitor(objectId, this.currentThreadId, stmt.loc.line);
        const currentThread = this.getOrCreateThread(this.currentThreadId);
        if (currentThread.status === 'WAITING_ON_LOCK') {
          throw new ThreadBlocked(objectId);
        }
        
        try {
          this.executeStatements(stmt.body, stmt.loc.line);
        } finally {
          this.releaseMonitor(objectId, this.currentThreadId, stmt.loc.line);
        }
        break;
      }
    }
  }

  // ── Expression evaluation ──────────────────────────────────────────────────

  private evalExpr(expr: Expr): Value {
    switch (expr.kind) {
      case 'IntLiteral':    return { kind: 'int',     value: expr.value };
      case 'LongLiteral':   return { kind: 'long',    value: expr.value };
      case 'DoubleLiteral': return { kind: 'double',  value: expr.value };
      case 'BoolLiteral':   return { kind: 'boolean', value: expr.value };
      case 'CharLiteral':   return { kind: 'char',    value: expr.value };
      case 'StringLiteral': return { kind: 'char',    value: expr.value }; // modeled as char value (string display)
      case 'NullLiteral':   return { kind: 'null' };
      case 'ThisExpr':      return this.getLocal('this');

      case 'VarExpr':
        return this.resolveVar(expr.name, expr.loc);

      case 'FieldAccessExpr': {
        const obj = this.evalExpr(expr.object);
        return this.getField(obj, expr.field, expr.loc);
      }

      case 'StaticFieldAccessExpr':
        return this.getStaticField(expr.className, expr.field, expr.loc);

      case 'AssignExpr':
        return this.evalAssign(expr);

      case 'CompoundAssignExpr': {
        const current = this.evalLHS(expr.target, expr.loc);
        const rhs     = this.evalExpr(expr.value);
        const op      = expr.op.slice(0, -1); // '+=' → '+'
        const result  = this.evalBinaryPrimitive(op as any, current, rhs, expr.loc);
        this.evalAssignValue(expr.target, result, expr.loc);
        return result;
      }

      case 'BinaryExpr':
        return this.evalBinary(expr);

      case 'UnaryExpr':
        return this.evalUnary(expr);

      case 'TernaryExpr': {
        const cond = this.evalExpr(expr.condition);
        return this.isTruthy(cond) ? this.evalExpr(expr.then) : this.evalExpr(expr.else_);
      }

      case 'InstanceofExpr':
        return this.evalInstanceof(expr);

      case 'NewObjectExpr':
        return this.evalNew(expr);

      case 'MethodCallExpr':
        return this.evalMethodCall(expr);

      case 'StaticMethodCallExpr':
        return this.evalStaticMethodCall(expr);

      case 'SuperCallExpr':
        return this.evalSuperCall(expr);

      case 'PrintlnExpr':
        return this.evalPrintln(expr);
    }
  }

  // ── new ────────────────────────────────────────────────────────────────────

  private evalNew(expr: { kind: 'NewObjectExpr'; className: string; args: Expr[]; loc: SourceLoc }): Value {
    if (this.heap.size >= LIMITS.MAX_HEAP_OBJECTS) {
      throw new InterpreterHalt({ kind: 'out_of_memory', limit: LIMITS.MAX_HEAP_OBJECTS, objectCount: this.heap.size });
    }

    const className = expr.className;
    const decl      = this.loaded.decls.get(className);
    const isBuiltinThread = className === 'Thread';
    const isBuiltinObject = className === 'Object' && !decl;
    if (!decl && !isBuiltinObject && !isBuiltinThread) throw new InterpreterHalt({ kind: 'class_not_found', name: className });

    // Ensure class is initialized before first instantiation
    if (!isBuiltinObject && !isBuiltinThread) {
      this.ensureInitialized(className, expr.loc.line);
    }

    const objectId  = `obj-${this.nextObjectId++}`;
    const argValues = expr.args.map(a => this.evalExpr(a));

    // Build field map with defaults — includes ALL inherited fields
    const fields     = new Map<string, Value>();
    if (!isBuiltinObject && !isBuiltinThread) {
      const fieldSlots = this.getAllInstanceFields(className);
      for (const [key, type] of fieldSlots) {
        fields.set(key, defaultValue(type));
      }
    }

    if (this.isThreadLike(className)) {
      const ctorCfg = this.resolveThreadCtorConfig(className, argValues, expr.loc.line);
      fields.set('Thread.name', { kind: 'char', value: ctorCfg.name });
      fields.set('Thread.started', { kind: 'boolean', value: false });
      fields.set('Thread.target', ctorCfg.target);
    }

    const runtimeObj: RuntimeObject = { objectId, klassName: className, fields };
    this.heap.set(objectId, runtimeObj);

    const objRef: Value = { kind: 'ref', objectId };

    // Add klass pointer arrow
    const arrowId = `arr-${objectId}-klass`;
    this.arrows = [
      ...this.arrows.filter(a => a.id !== arrowId),
      {
        id: arrowId,
        from: { region: 'heap',      elementId: objectId  },
        to:   { region: 'metaspace', elementId: className },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      }
    ];

    this.emitStep(expr.loc.line, {
      operation: 'new_object',
      description: `new ${className} — object allocated on heap, fields initialised to defaults`,
      highlightedElements: [{ region: 'heap', elementId: objectId }],
      newArrows: [arrowId],
      fadingArrows: [],
    });

    // Find and call the matching constructor
    if (isBuiltinObject || isBuiltinThread) {
      return objRef;
    }

    const classDecl = decl!;
    const ctor = this.findConstructor(classDecl, argValues.length);
    if (!ctor) {
      if (argValues.length !== 0) {
        throw new InterpreterHalt({ kind: 'runtime_error', message: `No constructor found for ${className} with ${argValues.length} args` });
      }
      // Java inserts an implicit default constructor when none is declared.
      return objRef;
    }

    this.executeConstructor(className, ctor, argValues, objRef);

    return objRef;
  }

  // ── Method dispatch ─────────────────────────────────────────────────────────

  private evalMethodCall(expr: { kind: 'MethodCallExpr'; receiver: Expr; method: string; args: Expr[]; loc: SourceLoc }): Value {
    const receiverVal = this.evalExpr(expr.receiver);

    if (receiverVal.kind !== 'ref') {
      // Could be a call on a primitive (e.g., toString on int) — unsupported
      throw new InterpreterHalt({ kind: 'runtime_error', message: `Cannot call method "${expr.method}" on non-object value` });
    }

    if (receiverVal.objectId === undefined) {
      throw new InterpreterHalt({ kind: 'null_pointer', className: '(unknown)', field: expr.method, line: expr.loc.line });
    }

    const obj       = this.heap.get(receiverVal.objectId);
    if (!obj) throw new InterpreterHalt({ kind: 'null_pointer', className: '(deallocated)', field: expr.method, line: expr.loc.line });

    const runtimeClassName = obj.klassName;
    const argValues        = expr.args.map(a => this.evalExpr(a));

    if (this.isThreadLike(runtimeClassName) && expr.method === 'start') {
      if (argValues.length !== 0) {
        throw new InterpreterHalt({ kind: 'runtime_error', message: 'Thread.start() with args is not supported' });
      }
      return this.intrinsicThreadStart(receiverVal.objectId, runtimeClassName, expr.loc.line);
    }

    if (this.isThreadLike(runtimeClassName) && expr.method === 'join') {
      if (argValues.length > 1) {
        throw new InterpreterHalt({ kind: 'runtime_error', message: 'Thread.join supports arity 0 or 1 in this phase' });
      }
      return this.intrinsicThreadJoin(receiverVal.objectId, argValues[0], expr.loc.line);
    }

    // vtable lookup: follow klass ptr → find slot
    return this.invokeVirtual(runtimeClassName, expr.method, receiverVal, argValues, expr.loc);
  }

  private invokeVirtual(runtimeClass: string, methodName: string, receiver: Value, args: Value[], loc: SourceLoc): Value {
    const arity = args.length;
    // Step 1: klass pointer follow
    this.emitStep(loc.line, {
      operation: 'klass_pointer_follow',
      description: `invokevirtual: follow klass ptr to ${runtimeClass}`,
      highlightedElements: [
        { region: 'heap',      elementId: (receiver as any).objectId },
        { region: 'metaspace', elementId: runtimeClass },
      ],
      newArrows: [],
      fadingArrows: [],
    });

    // Step 2: vtable lookup — match by name AND arity for overloaded methods
    const klass = this.klassState.get(runtimeClass);
    const slot  = klass?.vtable.find(s => s.methodName === methodName && s.arity === arity);
    if (!slot) {
      throw new InterpreterHalt({ kind: 'runtime_error', message: `Method ${runtimeClass}.${methodName}/${arity} not found in vtable` });
    }

    const vtableLookupArrowId = `arr-vtable-${this.nextArrowId++}`;
    this.emitStep(loc.line, {
      operation: 'vtable_lookup',
      description: `vtable[${slot.slot}] → ${slot.implementedBy}.${methodName}(${arity} arg${arity === 1 ? '' : 's'})`,
      highlightedElements: [{ region: 'metaspace', elementId: runtimeClass }],
      newArrows: [],
      fadingArrows: [],
    });

    // Dispatch to concrete implementation
    const implClass  = slot.implementedBy;
    const implDecl   = this.loaded.decls.get(implClass);
    const implMethod = implDecl?.methods.find(m => m.name === methodName && !m.isStatic && m.params.length === arity);

    if (!implMethod) {
      throw new InterpreterHalt({ kind: 'runtime_error', message: `No implementation of ${methodName}/${arity} found in ${implClass}` });
    }

    // Set up `this` correctly — receiver is passed as first argument
    const savedLocals = this.topFrame()?.locals ? new Map(this.topFrame()!.locals) : new Map();
    const frame = this.pushFrame(implClass, methodName, ['this', ...implMethod.params.map(p => p.name)], [receiver, ...args], implMethod.loc.line);

    this.emitStep(frame.currentLine, {
      operation: 'invokevirtual',
      description: `invokevirtual dispatched to ${implClass}.${methodName}()`,
      highlightedElements: [{ region: 'stack', elementId: frame.frameId }],
      newArrows: [],
      fadingArrows: [],
      methodInvoked: {
        klassName: implClass,
        methodName: methodName,
        frameId: frame.frameId,
        operationType: 'invokevirtual',
      },
    });

    let returnValue: Value = { kind: 'uninitialized' };
    try {
      if (!implMethod.body) throw new InterpreterHalt({ kind: 'runtime_error', message: `Abstract method ${implClass}.${methodName} has no body` });
      this.executeStatements(implMethod.body, implMethod.loc.line);
    } catch (e) {
      if (e instanceof ReturnSignal) {
        returnValue = e.value;
      } else throw e;
    }

    this.popFrame();

    this.emitStep(loc.line, {
      operation: 'return',
      description: `return from ${implClass}.${methodName}()`,
      highlightedElements: [],
      newArrows: [],
      fadingArrows: [],
    });

    return returnValue;
  }

  private invokeInterface(receiverClass: string, ifaceName: string, methodName: string, receiver: Value, args: Value[], loc: SourceLoc): Value {
    const arity = args.length;
    const klass = this.klassState.get(receiverClass);
    const entry = klass?.itable.find(e => e.interfaceName === ifaceName);
    const slot  = entry?.slots.find(s => s.methodName === methodName && s.arity === arity);

    if (!slot) {
      // Fall back to vtable lookup (some interpreters handle this)
      return this.invokeVirtual(receiverClass, methodName, receiver, args, loc);
    }

    this.emitStep(loc.line, {
      operation: 'itable_lookup',
      description: `invokeinterface: itable[${ifaceName}][${slot.slot}] → ${slot.implementedBy}.${methodName}()`,
      highlightedElements: [{ region: 'metaspace', elementId: receiverClass }],
      newArrows: [],
      fadingArrows: [],
    });

    const implClass  = slot.implementedBy;
    const implDecl   = this.loaded.decls.get(implClass);
    const implMethod = implDecl?.methods.find(m => m.name === methodName && !m.isStatic && m.params.length === arity);

    if (!implMethod) {
      throw new InterpreterHalt({ kind: 'runtime_error', message: `No implementation of ${methodName}/${arity} found in ${implClass}` });
    }

    const frame = this.pushFrame(implClass, methodName, ['this', ...implMethod.params.map(p => p.name)], [receiver, ...args], implMethod.loc.line);

    this.emitStep(frame.currentLine, {
      operation: 'invokeinterface',
      description: `invokeinterface dispatched to ${implClass}.${methodName}()`,
      highlightedElements: [{ region: 'stack', elementId: frame.frameId }],
      newArrows: [],
      fadingArrows: [],
    });

    let returnValue: Value = { kind: 'uninitialized' };
    try {
      if (implMethod.body) this.executeStatements(implMethod.body, implMethod.loc.line);
    } catch (e) {
      if (e instanceof ReturnSignal) returnValue = e.value;
      else throw e;
    }

    this.popFrame();
    return returnValue;
  }

  private evalStaticMethodCall(expr: { kind: 'StaticMethodCallExpr'; className: string; method: string; args: Expr[]; loc: SourceLoc }): Value {
    if (expr.className === 'Thread' && expr.method === 'sleep') {
      const args = expr.args.map(a => this.evalExpr(a));
      if (args.length !== 1) {
        throw new InterpreterHalt({ kind: 'runtime_error', message: 'Thread.sleep requires exactly one argument' });
      }
      const ticks = this.normalizeTimeoutTicks(args[0]!, expr.loc);
      this.emitStep(expr.loc.line, {
        operation: 'invokestatic',
        description: `Thread.sleep(${this.valueToString(args[0]!)}) — deterministic yield (${ticks} tick(s))`,
        highlightedElements: [],
        newArrows: [],
        fadingArrows: [],
      });

      if (this.currentThreadId === 'main') {
        this.runSpawnedThreads({ maxTicks: ticks });
      }

      return { kind: 'uninitialized' };
    }

    this.ensureInitialized(expr.className, expr.loc.line);

    const args   = expr.args.map(a => this.evalExpr(a));
    const arity  = args.length;
    const decl   = this.loaded.decls.get(expr.className);
    const method = decl?.methods.find(m => m.name === expr.method && m.isStatic && m.params.length === arity);
    if (!method) throw new InterpreterHalt({ kind: 'runtime_error', message: `Static method ${expr.className}.${expr.method}/${arity} not found` });

    return this.executeMethod(expr.className, method, args);
  }

  private evalSuperCall(expr: { kind: 'SuperCallExpr'; args: Expr[]; loc: SourceLoc }): Value {
    const currentFrame = this.topFrame();
    if (!currentFrame) throw new InterpreterHalt({ kind: 'runtime_error', message: 'super() called outside of constructor' });

    const currentClass = currentFrame.className;
    const decl         = this.loaded.decls.get(currentClass);
    const superName    = decl?.superclass ?? 'Object';
    if (superName === 'Object') return { kind: 'uninitialized' }; // Object() is no-op

    const superDecl = this.loaded.decls.get(superName);
    if (!superDecl) throw new InterpreterHalt({ kind: 'class_not_found', name: superName });

    const args  = expr.args.map(a => this.evalExpr(a));
    const thisV = this.getLocal('this');
    const ctor  = this.findConstructor(superDecl, args.length);
    if (!ctor) throw new InterpreterHalt({ kind: 'runtime_error', message: `No constructor in ${superName} for ${args.length} args` });

    this.emitStep(expr.loc.line, {
      operation: 'invokespecial',
      description: `invokespecial super() → ${superName}.<init>`,
      highlightedElements: [{ region: 'stack', elementId: currentFrame.frameId }],
      newArrows: [],
      fadingArrows: [],
    });

    this.executeConstructor(superName, ctor, args, thisV);
    return { kind: 'uninitialized' };
  }

  private evalPrintln(expr: { kind: 'PrintlnExpr'; args: Expr[]; loc: SourceLoc }): Value {
    const values  = expr.args.map(a => this.evalExpr(a));
    const printed = values.map(v => this.valueToString(v)).join('');
    this.stdout = [...this.stdout, printed];

    this.emitStep(expr.loc.line, {
      operation: 'invokevirtual',
      description: `System.out.println("${printed}")`,
      highlightedElements: [],
      newArrows: [],
      fadingArrows: [],
    });

    return { kind: 'uninitialized' };
  }

  // ── Field access & mutation ────────────────────────────────────────────────

  private getField(objRef: Value, fieldName: string, loc: SourceLoc): Value {
    if (objRef.kind !== 'ref') throw new InterpreterHalt({ kind: 'null_pointer', className: '(primitive)', field: fieldName, line: loc.line });
    const obj = this.heap.get(objRef.objectId);
    if (!obj) throw new InterpreterHalt({ kind: 'null_pointer', className: '(null)', field: fieldName, line: loc.line });

    const key = this.resolveFieldKey(obj.klassName, fieldName);
    const val = obj.fields.get(key);
    if (val === undefined) throw new InterpreterHalt({ kind: 'runtime_error', message: `Field ${fieldName} not found on ${obj.klassName}` });

    return val;
  }

  private setField(objRef: Value, fieldName: string, value: Value, loc: SourceLoc) {
    if (objRef.kind !== 'ref') throw new InterpreterHalt({ kind: 'null_pointer', className: '(primitive)', field: fieldName, line: loc.line });
    const obj = this.heap.get(objRef.objectId);
    if (!obj) throw new InterpreterHalt({ kind: 'null_pointer', className: '(null)', field: fieldName, line: loc.line });

    const key = this.resolveFieldKey(obj.klassName, fieldName);
    obj.fields.set(key, value);

    // Add reference arrow if value is a ref
    if (value.kind === 'ref') {
      const frame  = this.topFrame();
      const arrowId = `arr-field-${obj.objectId}-${fieldName}`;
      this.arrows = [
        ...this.arrows.filter(a => a.id !== arrowId),
        {
          id: arrowId,
          from: { region: 'heap', elementId: obj.objectId, fieldName },
          to:   { region: 'heap', elementId: value.objectId },
          operation: 'putfield',
        }
      ];
    }

    this.emitStep(loc.line, {
      operation: 'putfield',
      description: `putfield ${obj.klassName}.${fieldName} = ${this.valueToString(value)}`,
      highlightedElements: [{ region: 'heap', elementId: obj.objectId, fieldName }],
      newArrows: value.kind === 'ref' ? [`arr-field-${obj.objectId}-${fieldName}`] : [],
      fadingArrows: [],
    });
  }

  private getStaticField(className: string, fieldName: string, loc: SourceLoc): Value {
    this.ensureInitialized(className, loc.line);
    const klass = this.klassState.get(className);
    const field = klass?.staticFields.find(f => f.name === fieldName);
    if (!field) throw new InterpreterHalt({ kind: 'runtime_error', message: `Static field ${className}.${fieldName} not found` });
    return field.value;
  }

  private setStaticField(className: string, fieldName: string, value: Value, line: number | null) {
    const klass = this.klassState.get(className);
    if (!klass) throw new InterpreterHalt({ kind: 'runtime_error', message: `Class ${className} not loaded` });

    const field = klass.staticFields.find(f => f.name === fieldName);
    if (!field) {
      // First set — add it
      klass.staticFields.push({ name: fieldName, declaredIn: className, value });
    } else {
      field.value = value;
    }

    this.emitStep(line, {
      operation: 'putstatic',
      description: `putstatic ${className}.${fieldName} = ${this.valueToString(value)}`,
      highlightedElements: [{ region: 'metaspace', elementId: className, fieldName }],
      newArrows: [],
      fadingArrows: [],
    });
  }

  // ── Assignment ─────────────────────────────────────────────────────────────

  private evalAssign(expr: { kind: 'AssignExpr'; target: Expr; value: Expr; loc: SourceLoc }): Value {
    const value = this.evalExpr(expr.value);
    this.evalAssignValue(expr.target as any, value, expr.loc);
    return value;
  }

  private evalAssignValue(target: Expr, value: Value, loc: SourceLoc) {
    switch (target.kind) {
      case 'VarExpr': {
        // Could be local, unqualified static field, or this.field
        if (this.hasLocal(target.name)) {
          this.setLocal(target.name, value);
        } else {
          const frame = this.topFrame();
          const klass = frame ? this.klassState.get(frame.className) : undefined;
          const sf = klass?.staticFields.find(f => f.name === target.name);
          if (sf && frame) {
            this.setStaticField(frame.className, target.name, value, loc.line);
            break;
          }

          const thisRef = this.getLocal('this');
          this.setField(thisRef, target.name, value, loc);
        }
        break;
      }
      case 'FieldAccessExpr': {
        const obj = this.evalExpr(target.object);
        this.setField(obj, target.field, value, loc);
        break;
      }
      case 'StaticFieldAccessExpr':
        this.setStaticField(target.className, target.field, value, loc.line);
        break;
      default:
        throw new InterpreterHalt({ kind: 'runtime_error', message: `Cannot assign to ${(target as any).kind}` });
    }
  }

  private evalLHS(target: Expr, loc: SourceLoc): Value {
    switch (target.kind) {
      case 'VarExpr': {
        if (this.hasLocal(target.name)) return this.getLocal(target.name);
        const frame = this.topFrame();
        const klass = frame ? this.klassState.get(frame.className) : undefined;
        const sf = klass?.staticFields.find(f => f.name === target.name);
        if (sf && frame) return this.getStaticField(frame.className, target.name, loc);
        return this.getField(this.getLocal('this'), target.name, loc);
      }
      case 'FieldAccessExpr':
        return this.getField(this.evalExpr(target.object), target.field, loc);
      case 'StaticFieldAccessExpr':
        return this.getStaticField(target.className, target.field, loc);
      default:
        throw new InterpreterHalt({ kind: 'runtime_error', message: `Cannot read LHS ${(target as any).kind}` });
    }
  }

  // ── Binary & unary ─────────────────────────────────────────────────────────

  private evalBinary(expr: { op: string; left: Expr; right: Expr; loc: SourceLoc }): Value {
    // Short-circuit for &&/||
    if (expr.op === '&&') {
      const l = this.evalExpr(expr.left);
      if (!this.isTruthy(l)) return { kind: 'boolean', value: false };
      return { kind: 'boolean', value: this.isTruthy(this.evalExpr(expr.right)) };
    }
    if (expr.op === '||') {
      const l = this.evalExpr(expr.left);
      if (this.isTruthy(l)) return { kind: 'boolean', value: true };
      return { kind: 'boolean', value: this.isTruthy(this.evalExpr(expr.right)) };
    }

    const left  = this.evalExpr(expr.left);
    const right = this.evalExpr(expr.right);
    return this.evalBinaryPrimitive(expr.op as any, left, right, expr.loc);
  }

  private evalBinaryPrimitive(op: string, left: Value, right: Value, loc: SourceLoc): Value {
    // String concatenation with +
    if (op === '+' && (left.kind === 'char' || right.kind === 'char')) {
      return { kind: 'char', value: this.valueToString(left) + this.valueToString(right) };
    }

    const ln = this.toNumber(left, loc);
    const rn = this.toNumber(right, loc);

    switch (op) {
      case '+':  return this.numResult(left, ln + rn);
      case '-':  return this.numResult(left, ln - rn);
      case '*':  return this.numResult(left, ln * rn);
      case '/':
        if (rn === 0) throw new InterpreterHalt({ kind: 'division_by_zero', line: loc.line });
        return this.numResult(left, left.kind === 'int' || left.kind === 'long' ? Math.trunc(ln / rn) : ln / rn);
      case '%':
        if (rn === 0) throw new InterpreterHalt({ kind: 'division_by_zero', line: loc.line });
        return this.numResult(left, ln % rn);
      case '==':  return { kind: 'boolean', value: this.valuesEqual(left, right) };
      case '!=':  return { kind: 'boolean', value: !this.valuesEqual(left, right) };
      case '<':   return { kind: 'boolean', value: ln < rn };
      case '>':   return { kind: 'boolean', value: ln > rn };
      case '<=':  return { kind: 'boolean', value: ln <= rn };
      case '>=':  return { kind: 'boolean', value: ln >= rn };
      default:    throw new InterpreterHalt({ kind: 'runtime_error', message: `Unknown binary op: ${op}` });
    }
  }

  private evalUnary(expr: { op: string; operand: Expr; prefix: boolean; loc: SourceLoc }): Value {
    switch (expr.op) {
      case '-': {
        const v = this.evalExpr(expr.operand);
        return this.numResult(v, -this.toNumber(v, expr.loc));
      }
      case '!': {
        const v = this.evalExpr(expr.operand);
        return { kind: 'boolean', value: !this.isTruthy(v) };
      }
      case '++':
      case '--': {
        const delta = expr.op === '++' ? 1 : -1;
        const old   = this.evalLHS(expr.operand, expr.loc);
        const nv    = this.numResult(old, this.toNumber(old, expr.loc) + delta);
        this.evalAssignValue(expr.operand, nv, expr.loc);
        return expr.prefix ? nv : old;
      }
    }
    throw new InterpreterHalt({ kind: 'runtime_error', message: `Unknown unary op: ${expr.op}` });
  }

  // ── instanceof ─────────────────────────────────────────────────────────────
  // JVM checkcast equivalent: walk the runtime klass hierarchy in Metaspace.
  // Emits a klass_pointer_follow step so the user sees the type-check path.

  private evalInstanceof(expr: { kind: 'InstanceofExpr'; expr: Expr; className: string; loc: SourceLoc }): Value {
    const val = this.evalExpr(expr.expr);

    // Null is never an instanceof anything
    if (val.kind === 'null') return { kind: 'boolean', value: false };
    if (val.kind !== 'ref')  return { kind: 'boolean', value: false };

    const obj = this.heap.get(val.objectId);
    if (!obj) return { kind: 'boolean', value: false };

    const runtimeClass  = obj.klassName;
    const targetClass   = expr.className;

    // Emit klass_pointer_follow: the JVM follows klass ptr and walks the hierarchy
    this.emitStep(expr.loc.line, {
      operation: 'klass_pointer_follow',
      description: `instanceof: follow klass ptr of ${runtimeClass}, checking if assignable to ${targetClass}`,
      highlightedElements: [
        { region: 'heap',      elementId: val.objectId  },
        { region: 'metaspace', elementId: runtimeClass  },
        { region: 'metaspace', elementId: targetClass   },
      ],
      newArrows: [],
      fadingArrows: [],
    });

    // Walk klass hierarchy: runtimeClass must be or extend targetClass
    const result = this.isAssignableTo(runtimeClass, targetClass);
    return { kind: 'boolean', value: result };
  }

  /** Returns true if runtimeClass IS targetClass or a subclass/implementor of it. */
  private isAssignableTo(runtimeClass: string, targetClass: string): boolean {
    let current: string | null = runtimeClass;
    while (current !== null && current !== 'Object') {
      if (current === targetClass) return true;
      const decl = this.loaded.decls.get(current);
      if (!decl) break;
      // Check interfaces too
      if (decl.interfaces.includes(targetClass)) return true;
      current = decl.superclass;
    }
    // Object itself
    return targetClass === 'Object';
  }

  // ── Locals ─────────────────────────────────────────────────────────────────

  private getLocal(name: string): Value {
    const frame = this.topFrame();
    if (!frame) throw new InterpreterHalt({ kind: 'runtime_error', message: `No frame to read local ${name}` });
    const v = frame.locals.get(name);
    if (v === undefined) return { kind: 'uninitialized' };
    return v;
  }

  private setLocal(name: string, value: Value) {
    const frame = this.topFrame();
    if (!frame) throw new InterpreterHalt({ kind: 'runtime_error', message: `No frame to write local ${name}` });
    frame.locals.set(name, value);
  }

  private hasLocal(name: string): boolean {
    const frame = this.topFrame();
    return frame?.locals.has(name) ?? false;
  }

  private resolveVar(name: string, loc: SourceLoc): Value {
    if (this.hasLocal(name)) return this.getLocal(name);
    // Try as this.field
    if (this.hasLocal('this')) {
      const thisRef = this.getLocal('this');
      if (thisRef.kind === 'ref') {
        const obj = this.heap.get(thisRef.objectId);
        if (obj) {
          const key = this.resolveFieldKey(obj.klassName, name);
          const val = obj.fields.get(key);
          if (val !== undefined) return val;
        }
      }
    }
    // Try as static field on current class
    const frame = this.topFrame();
    if (frame) {
      const klass = this.klassState.get(frame.className);
      const sf    = klass?.staticFields.find(f => f.name === name);
      if (sf) return sf.value;
    }
    throw new InterpreterHalt({ kind: 'runtime_error', message: `Cannot resolve variable "${name}" at line ${loc.line}` });
  }

  // ── Frame management ───────────────────────────────────────────────────────

  private pushFrame(className: string, methodName: string, paramNames: string[], argValues: Value[], lineHint: number | null): RuntimeFrame {
    const thread = this.getOrCreateThread(this.currentThreadId);
    if (thread.callStack.length >= LIMITS.MAX_STACK_DEPTH) {
      throw new InterpreterHalt({ kind: 'stack_overflow', maxDepth: LIMITS.MAX_STACK_DEPTH, frameCount: thread.callStack.length });
    }

    const frame: RuntimeFrame = {
      frameId:     `frame-${thread.nextFrameId++}`,
      className,
      methodName,
      descriptor:  '()',  // simplified
      locals:      new Map(),
      currentLine: lineHint,
    };

    for (let i = 0; i < paramNames.length; i++) {
      const name = paramNames[i];
      if (name !== undefined) frame.locals.set(name, argValues[i] ?? { kind: 'uninitialized' });
    }

    thread.callStack.push(frame);
    return frame;
  }

  private popFrame() {
    const thread = this.getOrCreateThread(this.currentThreadId);
    thread.callStack.pop();
  }

  private topFrame(): RuntimeFrame | undefined {
    const thread = this.getOrCreateThread(this.currentThreadId);
    return thread.callStack[thread.callStack.length - 1];
  }

  private setCurrentLine(line: number | null) {
    const frame = this.topFrame();
    if (frame) frame.currentLine = line;
  }

  private getOrCreateThread(threadId: string): ThreadState {
    if (!this.threads.has(threadId)) {
      this.threads.set(threadId, {
        threadId,
        status: 'RUNNABLE',
        callStack: [],
        nextFrameId: 1,
        waitingOn: null,
        waitUntilTick: null,
        waitingLine: null,
        tasks: [],
      });
      this.threadOrder.push(threadId);
      if (!this.threadDisplayNames.has(threadId)) {
        this.threadDisplayNames.set(threadId, threadId);
      }
    }
    return this.threads.get(threadId)!;
  }

  private maybeSpawnThreadDirectives(currentLine: number) {
    if (this.currentThreadId !== 'main') return;

    while (this.nextDirectiveIdx < this.threadDirectives.length) {
      const directive = this.threadDirectives[this.nextDirectiveIdx]!;
      if (directive.line > currentLine) break;

      const hostFrame = this.topFrame();
      const capturedLocals = new Map<string, Value>(hostFrame?.locals ?? []);
      const thread = this.getOrCreateThread(directive.threadId);
      this.threadDisplayNames.set(directive.threadId, directive.threadId);

      thread.tasks.push({
        kind: 'directive_expr',
        originLine: directive.line,
        runExpr: directive.runExpr,
        capturedLocals,
      });

      if (thread.status !== 'WAITING_ON_LOCK' && thread.status !== 'WAITING_ON_THREAD') {
        thread.status = 'RUNNABLE';
        thread.waitUntilTick = null;
        thread.waitingLine = null;
      }

      this.emitStep(directive.line, {
        operation: 'invokestatic',
        description: `thread_start — ${directive.threadId} queued`,
        highlightedElements: [],
        newArrows: [],
        fadingArrows: [],
      });

      this.nextDirectiveIdx++;
    }
  }

  private runSpawnedThreads(opts?: { maxTicks?: number }) {
    const previousThreadId = this.currentThreadId;
    const workerIds = () => this.threadOrder.filter(tid => tid !== 'main');
    let ticksLeft = opts?.maxTicks ?? Number.MAX_SAFE_INTEGER;

    while (ticksLeft > 0) {
      ticksLeft--;
      this.schedulerTick++;
      let progressed = false;
      if (this.processTimedWakeups()) progressed = true;
      const workers = workerIds();

      if (workers.length === 0) break;

      for (const threadId of workers) {
        const thread = this.threads.get(threadId);
        if (!thread || thread.tasks.length === 0) {
          if (thread && thread.status !== 'WAITING_ON_LOCK' && thread.status !== 'WAITING_ON_THREAD') {
            thread.status = 'TERMINATED';
          }
          continue;
        }

        if (thread.status !== 'RUNNABLE') continue;
        if (this.executeThreadTask(threadId)) progressed = true;
      }

      if (!progressed && !this.hasTimedWaiters()) break;
    }

    this.currentThreadId = previousThreadId;
  }

  private executeThreadTask(threadId: string): boolean {
    const thread = this.threads.get(threadId);
    if (!thread || thread.tasks.length === 0) {
      if (thread && thread.status !== 'WAITING_ON_LOCK' && thread.status !== 'WAITING_ON_THREAD') {
        thread.status = 'TERMINATED';
      }
      return false;
    }
    if (thread.status !== 'RUNNABLE') return false;

    const task = thread.tasks[0]!;
    const previousThreadId = this.currentThreadId;
    this.currentThreadId = threadId;
    const runFrame = this.pushFrame('Thread', 'run', [], [], task.originLine);
    runFrame.locals = new Map(task.capturedLocals ?? []);

    this.emitStep(task.originLine, {
      operation: 'invokestatic',
      description: `thread_dispatch — ${threadId}`,
      highlightedElements: [{ region: 'stack', elementId: runFrame.frameId }],
      newArrows: [],
      fadingArrows: [],
    });

    try {
      if (task.kind === 'directive_expr') {
        if (!task.runExpr) {
          throw new InterpreterHalt({ kind: 'runtime_error', message: `Thread task missing run expression for ${threadId}` });
        }
        this.evalExpr(task.runExpr);
      } else {
        if (!task.threadObjectId) {
          throw new InterpreterHalt({ kind: 'runtime_error', message: `Thread task missing thread object for ${threadId}` });
        }
        this.executeThreadRunTask(task.threadObjectId, task.originLine);
      }
      thread.tasks.shift();
      this.popFrame();
      this.emitStep(task.originLine, {
        operation: 'return',
        description: `thread_complete — ${threadId}`,
        highlightedElements: [],
        newArrows: [],
        fadingArrows: [],
      });

      if (thread.tasks.length === 0) {
        thread.status = 'TERMINATED';
        thread.waitingOn = null;
        thread.waitUntilTick = null;
        thread.waitingLine = null;
        this.wakeJoinWaiters(threadId, task.originLine);
      }
      return true;
    } catch (e) {
      if (e instanceof ThreadBlocked) {
        this.popFrame();
        return false;
      }
      if (e instanceof InterpreterHalt) {
        if (this.isDeadlockError(e.error)) {
          throw e;
        }
        // Thread-level failure: terminate this worker task, keep JVM trace flowing.
        this.popFrame();
        thread.tasks.shift();
        thread.status = 'TERMINATED';
        this.emitStep(task.originLine, {
          operation: 'return',
          description: `thread_error — ${threadId}: ${this.errorSummary(e.error)}`,
          highlightedElements: [{ region: 'stack', elementId: runFrame.frameId }],
          newArrows: [],
          fadingArrows: [],
        });
        return true;
      }
      throw e;
    } finally {
      this.currentThreadId = previousThreadId;
    }
  }

  private executeThreadRunTask(threadObjectId: string, lineHint: number): void {
    const obj = this.heap.get(threadObjectId);
    if (!obj) {
      throw new InterpreterHalt({ kind: 'null_pointer', className: 'Thread', field: 'run', line: lineHint });
    }

    const target = obj.fields.get('Thread.target');
    if (target?.kind === 'ref') {
      const targetObj = this.heap.get(target.objectId);
      if (!targetObj) {
        throw new InterpreterHalt({ kind: 'null_pointer', className: 'Runnable', field: 'run', line: lineHint });
      }
      this.invokeVirtual(targetObj.klassName, 'run', target, [], { line: lineHint, column: 0 });
      return;
    }

    if (!this.hasRunnableRunMethod(obj.klassName)) {
      this.emitStep(lineHint, {
        operation: 'invokevirtual',
        description: `thread_run — ${threadObjectId} has no overridden run(), no-op`,
        highlightedElements: [{ region: 'heap', elementId: threadObjectId }],
        newArrows: [],
        fadingArrows: [],
      });
      return;
    }

    const receiver: Value = { kind: 'ref', objectId: threadObjectId };
    this.invokeVirtual(obj.klassName, 'run', receiver, [], { line: lineHint, column: 0 });
  }

  private hasRunnableRunMethod(className: string): boolean {
    if (className === 'Thread') return false;
    let current: string | null = className;
    while (current && current !== 'Object') {
      const decl = this.loaded.decls.get(current);
      if (!decl) break;
      if (decl.methods.some(m => m.name === 'run' && !m.isStatic && m.params.length === 0)) {
        return true;
      }
      current = decl.superclass;
    }
    return false;
  }

  private wakeJoinWaiters(completedThreadId: string, lineHint: number) {
    for (const waiter of this.threads.values()) {
      if (waiter.status === 'WAITING_ON_THREAD' && waiter.waitingOn === `thread:${completedThreadId}`) {
        waiter.status = 'RUNNABLE';
        waiter.waitingOn = null;
        waiter.waitUntilTick = null;
        waiter.waitingLine = null;
        this.emitStep(lineHint, {
          operation: 'return',
          description: `thread_unpark — ${waiter.threadId} resumed after join(${completedThreadId})`,
          highlightedElements: [],
          newArrows: [],
          fadingArrows: [],
        });
      }
    }
  }

  private intrinsicThreadStart(threadObjectId: string, runtimeClassName: string, lineHint: number | null): Value {
    const existing = this.threadObjectToThreadId.get(threadObjectId);
    if (existing) {
      throw new InterpreterHalt({ kind: 'runtime_error', message: `IllegalThreadStateException: thread already started (${existing})` });
    }

    const runtimeObj = this.heap.get(threadObjectId);
    if (!runtimeObj) {
      throw new InterpreterHalt({ kind: 'null_pointer', className: runtimeClassName, field: 'start', line: lineHint });
    }

    const displayName = this.readThreadObjectName(runtimeObj) ?? `Thread-${this.nextAutoThreadId++}`;
    const preferred = displayName;
    const threadId = this.uniqueThreadId(preferred);
    this.threadObjectToThreadId.set(threadObjectId, threadId);
    this.threadDisplayNames.set(threadId, displayName);

    const thread = this.getOrCreateThread(threadId);
    thread.status = 'RUNNABLE';
    thread.waitingOn = null;
    thread.waitUntilTick = null;
    thread.waitingLine = null;
    thread.tasks.push({
      kind: 'thread_run',
      originLine: lineHint ?? 0,
      threadObjectId,
    });

    runtimeObj.fields.set('Thread.started', { kind: 'boolean', value: true });

    this.emitStep(lineHint, {
      operation: 'invokevirtual',
      description: `thread_start — ${threadId} queued`,
      highlightedElements: [{ region: 'heap', elementId: threadObjectId }],
      newArrows: [],
      fadingArrows: [],
    });

    return { kind: 'uninitialized' };
  }

  private intrinsicThreadJoin(threadObjectId: string, timeoutArg: Value | undefined, lineHint: number | null): Value {
    const timeoutTicks = timeoutArg ? this.normalizeTimeoutTicks(timeoutArg, { line: lineHint ?? 0, column: 0 }) : null;
    const targetThreadId = this.threadObjectToThreadId.get(threadObjectId);
    if (!targetThreadId) {
      this.emitStep(lineHint, {
        operation: 'invokevirtual',
        description: 'thread_join — target not started, immediate return',
        highlightedElements: [],
        newArrows: [],
        fadingArrows: [],
      });
      return { kind: 'uninitialized' };
    }

    const target = this.threads.get(targetThreadId);
    if (!target || target.status === 'TERMINATED') {
      this.emitStep(lineHint, {
        operation: 'invokevirtual',
        description: `thread_join — ${targetThreadId} already terminated`,
        highlightedElements: [],
        newArrows: [],
        fadingArrows: [],
      });
      return { kind: 'uninitialized' };
    }

    if (this.currentThreadId === targetThreadId) {
      throw new InterpreterHalt({ kind: 'runtime_error', message: `IllegalThreadStateException: ${targetThreadId} cannot join itself` });
    }

    if (this.currentThreadId === 'main') {
      this.runSpawnedThreads(timeoutTicks ? { maxTicks: timeoutTicks } : undefined);
      const targetAfter = this.threads.get(targetThreadId);
      const joined = !targetAfter || targetAfter.status === 'TERMINATED';
      this.emitStep(lineHint, {
        operation: 'invokevirtual',
        description: joined
          ? `thread_join — ${targetThreadId} joined`
          : `thread_join_timeout — main timed out waiting on ${targetThreadId}`,
        highlightedElements: [],
        newArrows: [],
        fadingArrows: [],
      });
      if (!joined && timeoutTicks) {
        this.emitStep(lineHint, {
          operation: 'return',
          description: `thread_wakeup — main resumed after join timeout on ${targetThreadId}`,
          highlightedElements: [],
          newArrows: [],
          fadingArrows: [],
        });
      }
      return { kind: 'uninitialized' };
    }

    const current = this.getOrCreateThread(this.currentThreadId);
    current.status = 'WAITING_ON_THREAD';
    current.waitingOn = `thread:${targetThreadId}`;
    current.waitingLine = lineHint;
    current.waitUntilTick = timeoutTicks ? (this.schedulerTick + timeoutTicks) : null;
    this.emitStep(lineHint, {
      operation: 'invokevirtual',
      description: timeoutTicks
        ? `thread_join — ${this.currentThreadId} waiting on ${targetThreadId} (timeout ${timeoutTicks} tick(s))`
        : `thread_join — ${this.currentThreadId} waiting on ${targetThreadId}`,
      highlightedElements: [],
      newArrows: [],
      fadingArrows: [],
    });
    throw new ThreadBlocked(`thread:${targetThreadId}`);
  }

  private readThreadObjectName(obj: RuntimeObject): string | null {
    const v = obj.fields.get('Thread.name');
    if (v && v.kind === 'char' && v.value.trim().length > 0) {
      return v.value;
    }
    return null;
  }

  private resolveThreadCtorConfig(className: string, args: Value[], line: number | null): { name: string; target: Value } {
    const defaultName = `Thread-${this.nextAutoThreadId++}`;
    const nullTarget: Value = { kind: 'null' };

    if (className !== 'Thread') {
      return { name: defaultName, target: nullTarget };
    }

    if (args.length === 0) {
      return { name: defaultName, target: nullTarget };
    }

    if (args.length === 1) {
      const first = args[0]!;
      if (first.kind === 'char') {
        const trimmed = first.value.trim();
        return { name: trimmed.length > 0 ? trimmed : defaultName, target: nullTarget };
      }
      if (first.kind === 'ref') {
        if (!this.isRunnableRef(first)) {
          throw new InterpreterHalt({ kind: 'runtime_error', message: 'Thread(Runnable) requires object implementing Runnable' });
        }
        return { name: defaultName, target: first };
      }
    }

    if (args.length === 2) {
      const first = args[0]!;
      const second = args[1]!;
      if (first.kind === 'ref' && second.kind === 'char') {
        if (!this.isRunnableRef(first)) {
          throw new InterpreterHalt({ kind: 'runtime_error', message: 'Thread(Runnable, String) requires object implementing Runnable' });
        }
        const trimmed = second.value.trim();
        return { name: trimmed.length > 0 ? trimmed : defaultName, target: first };
      }
    }

    throw new InterpreterHalt({
      kind: 'runtime_error',
      message: `Unsupported Thread constructor arity/signature at line ${line ?? 0}. Supported: Thread(), Thread(String), Thread(Runnable), Thread(Runnable, String).`,
    });
  }

  private isRunnableRef(v: Value): boolean {
    if (v.kind !== 'ref') return false;
    const obj = this.heap.get(v.objectId);
    if (!obj) return false;
    if (this.isThreadLike(obj.klassName)) return true;

    let current: string | null = obj.klassName;
    while (current && current !== 'Object') {
      const decl = this.loaded.decls.get(current);
      if (!decl) break;
      if (decl.interfaces.includes('Runnable')) return true;
      current = decl.superclass;
    }
    return false;
  }

  private normalizeTimeoutTicks(timeoutValue: Value, loc: SourceLoc): number {
    const raw = this.toNumber(timeoutValue, loc);
    if (!Number.isFinite(raw) || raw < 0) {
      throw new InterpreterHalt({ kind: 'runtime_error', message: 'Timeout must be a non-negative number' });
    }
    if (raw === 0) return 1;
    return Math.max(1, Math.min(200, Math.trunc(raw)));
  }

  private hasTimedWaiters(): boolean {
    for (const thread of this.threads.values()) {
      if (thread.status === 'WAITING_ON_THREAD' && thread.waitUntilTick !== null) return true;
    }
    return false;
  }

  private processTimedWakeups(): boolean {
    let wokeAny = false;

    for (const thread of this.threads.values()) {
      if (thread.status !== 'WAITING_ON_THREAD' || thread.waitUntilTick === null) continue;
      if (this.schedulerTick < thread.waitUntilTick) continue;

      const reason = thread.waitingOn ?? 'thread';
      thread.status = 'RUNNABLE';
      thread.waitingOn = null;
      thread.waitUntilTick = null;
      const wakeLine = thread.waitingLine;
      thread.waitingLine = null;

      this.emitStep(wakeLine, {
        operation: 'return',
        description: reason.startsWith('sleep:')
          ? `thread_wakeup — ${thread.threadId} resumed after sleep timeout`
          : `thread_wakeup — ${thread.threadId} resumed after join timeout`,
        highlightedElements: [],
        newArrows: [],
        fadingArrows: [],
      });
      wokeAny = true;
    }

    return wokeAny;
  }

  private uniqueThreadId(preferred: string): string {
    if (!this.threads.has(preferred) && preferred !== 'main') return preferred;
    let i = 1;
    while (this.threads.has(`${preferred}-${i}`) || `${preferred}-${i}` === 'main') i++;
    return `${preferred}-${i}`;
  }

  private isThreadLike(className: string): boolean {
    if (className === 'Thread') return true;
    let current: string | null = className;
    while (current && current !== 'Object') {
      if (current === 'Thread') return true;
      const decl = this.loaded.decls.get(current);
      current = decl?.superclass ?? null;
    }
    return false;
  }

  private ensureBuiltinKlasses() {
    if (!this.klassState.has('Runnable')) {
      this.klassState.set('Runnable', {
        klassName: 'Runnable',
        superKlassName: null,
        interfaces: [],
        isInterface: true,
        isInitialized: true,
        staticFields: [],
        vtable: [],
        itable: [],
      });
    }

    if (!this.klassState.has('Thread')) {
      this.klassState.set('Thread', {
        klassName: 'Thread',
        superKlassName: 'Object',
        interfaces: ['Runnable'],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'run', arity: 0, descriptor: '()V', implementedBy: 'Thread' },
          { slot: 4, methodName: 'start', arity: 0, descriptor: '()V', implementedBy: 'Thread' },
          { slot: 5, methodName: 'join', arity: 0, descriptor: '()V', implementedBy: 'Thread' },
          { slot: 6, methodName: 'join', arity: 1, descriptor: '(J)V', implementedBy: 'Thread' },
        ],
        itable: [],
      });
    }
  }

  private isDeadlockError(error: InterpreterError): boolean {
    return error.kind === 'runtime_error' && error.message.startsWith('Deadlock detected:');
  }

  private errorSummary(error: InterpreterError): string {
    switch (error.kind) {
      case 'parse_error':
        return `parse error${error.line ? ` at line ${error.line}` : ''}: ${error.message}`;
      case 'unsupported_syntax':
        return `unsupported syntax${error.line ? ` at line ${error.line}` : ''}: ${error.feature}`;
      case 'stack_overflow':
        return `stack overflow (${error.frameCount}/${error.maxDepth})`;
      case 'out_of_memory':
        return `out of memory (${error.objectCount}/${error.limit})`;
      case 'step_limit':
        return `step limit reached (${error.limit})`;
      case 'null_pointer':
        return `null pointer on ${error.className}.${error.field}`;
      case 'division_by_zero':
        return `division by zero${error.line ? ` at line ${error.line}` : ''}`;
      case 'class_not_found':
        return `class not found: ${error.name}`;
      case 'runtime_error':
        return error.message;
      default:
        return 'runtime error';
    }
  }

  // ── Step emission ──────────────────────────────────────────────────────────

  private emitStep(sourceLineNumber: number | null, delta: Delta | null) {
    this.checkStepLimit();

    // Build thread state map (Phase 2)
    const threadStates = new Map<string, any>();
    for (const [threadId, thread] of this.threads) {
      threadStates.set(threadId, thread.status);
    }

    const step: Step = {
      stepIndex:        this.steps.length,
      label:            delta?.description ?? 'initial state',
      sourceLineNumber,
      stack:            this.snapshotStack(),
      heap:             this.snapshotHeap(),
      metaspace:        this.snapshotMetaspace(),
      arrows:           [...this.arrows],
      delta,
      stdout:           [...this.stdout],
      activeThreadId:   this.currentThreadId,  // Phase 2: actual active thread
      threadStates,  // Phase 2: actual thread states
      threadDisplayNames: new Map(this.threadDisplayNames),
    };

    this.steps.push(step);
  }

  private checkStepLimit() {
    if (this.steps.length >= LIMITS.MAX_STEPS) {
      throw new InterpreterHalt({ kind: 'step_limit', limit: LIMITS.MAX_STEPS });
    }
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  private snapshotStack(): StackFrame[] {
    const result: StackFrame[] = [];
    // Iterate threads in order for deterministic output
    for (const threadId of this.threadOrder) {
      const thread = this.threads.get(threadId);
      if (!thread) continue;
      for (const f of thread.callStack) {
        result.push({
          frameId:      f.frameId,
          className:    f.className,
          methodName:   f.methodName,
          descriptor:   f.descriptor,
          lineNumber:   f.currentLine,
          locals:       this.snapshotLocals(f),
          operandStack: [],
          threadId,  // Phase 2: actual thread ID
        });
      }
    }
    return result;
  }

  private snapshotLocals(frame: RuntimeFrame) {
    const result: import('../../types.js').LocalVar[] = [];
    let slot = 0;
    for (const [name, value] of frame.locals) {
      result.push({ slot: slot++, name, value });
    }
    return result;
  }

  private snapshotHeap(): HeapObject[] {
    const result: HeapObject[] = [];
    for (const [objId, obj] of this.heap) {
      const lock = this.locks.get(objId);
      let markWord: any = 'unlocked';
      let monitor: any = null;

      if (lock) {
        // Object is locked
        markWord = { kind: 'thin-locked', threadId: lock.owner };
        monitor = {
          owner: lock.owner,
          depth: lock.depth,
          waitQueue: lock.waitQueue,
          acquiredAt: lock.acquiredAt,
        };
      }

      result.push({
        objectId:  obj.objectId,
        klassName: obj.klassName,
        fields:    this.snapshotFields(obj),
        markWord,
        monitor,
      });
    }
    return result;
  }

  private snapshotFields(obj: RuntimeObject): import('../../types.js').FieldSlot[] {
    const result: import('../../types.js').FieldSlot[] = [];
    for (const [key, value] of obj.fields) {
      // key is "ClassName.fieldName"
      const dot   = key.lastIndexOf('.');
      const declaredIn = dot >= 0 ? key.slice(0, dot) : obj.klassName;
      const name  = dot >= 0 ? key.slice(dot + 1) : key;
      // Look up isVolatile from the declaring class's field declarations
      const decl      = this.loaded.decls.get(declaredIn);
      const fieldDecl = decl?.fields.find(f => f.name === name && !f.isStatic);
      const slot: import('../../types.js').FieldSlot = { name, declaredIn, value };
      if (fieldDecl?.isVolatile) slot.isVolatile = true;
      result.push(slot);
    }
    return result;
  }

  private snapshotMetaspace(): KlassInfo[] {
    return Array.from(this.klassState.values()).map(k => ({ ...k, staticFields: [...k.staticFields] }));
  }

  // ── Lookup helpers ─────────────────────────────────────────────────────────

  private findMainClass(program: Program): ClassDecl {
    for (const c of program.classes) {
      if (c.methods.some(m => m.name === 'main' && m.isStatic)) return c;
    }
    throw new InterpreterHalt({ kind: 'runtime_error', message: 'No class with a static main() method found' });
  }

  private findMainMethod(decl: ClassDecl): MethodDecl {
    const m = decl.methods.find(m => m.name === 'main' && m.isStatic);
    if (!m) throw new InterpreterHalt({ kind: 'runtime_error', message: `No main() in ${decl.name}` });
    return m;
  }

  private findConstructor(decl: ClassDecl, arity: number): ConstructorDecl | undefined {
    // Exact arity match first, then any
    return decl.constructors.find(c => c.params.length === arity) ?? decl.constructors[0];
  }

  private getAllInstanceFields(className: string): Map<string, { kind: string }> {
    const result = new Map<string, { kind: string }>();
    const chain: string[] = [];

    let current: string | null = className;
    while (current && current !== 'Object') {
      chain.unshift(current);
      const decl = this.loaded.decls.get(current);
      current    = decl?.superclass ?? null;
    }

    for (const name of chain) {
      const decl = this.loaded.decls.get(name);
      if (!decl) continue;
      for (const f of decl.fields.filter(f => !f.isStatic)) {
        result.set(`${name}.${f.name}`, f.type);
      }
    }
    return result;
  }

  private resolveFieldKey(className: string, fieldName: string): string {
    // Walk hierarchy to find which class declared the field
    let current: string | null = className;
    while (current && current !== 'Object') {
      const decl = this.loaded.decls.get(current);
      if (decl?.fields.find(f => f.name === fieldName && !f.isStatic)) {
        return `${current}.${fieldName}`;
      }
      current = decl?.superclass ?? null;
    }
    return `${className}.${fieldName}`;  // fallback
  }

  // ── Value helpers ──────────────────────────────────────────────────────────

  private isTruthy(v: Value): boolean {
    switch (v.kind) {
      case 'boolean': return v.value;
      case 'int':
      case 'long':
      case 'double':
      case 'float':   return v.value !== 0;
      case 'null':    return false;
      default:        return true;
    }
  }

  private toNumber(v: Value, loc: SourceLoc): number {
    switch (v.kind) {
      case 'int':
      case 'long':
      case 'double':
      case 'float':   return v.value;
      case 'boolean': return v.value ? 1 : 0;
      case 'char':    return v.value.charCodeAt(0);
      default:        throw new InterpreterHalt({ kind: 'runtime_error', message: `Cannot use ${v.kind} as number at line ${loc.line}` });
    }
  }

  private numResult(template: Value, result: number): Value {
    switch (template.kind) {
      case 'long':   return { kind: 'long',   value: result };
      case 'double': return { kind: 'double', value: result };
      case 'float':  return { kind: 'float',  value: result };
      default:       return { kind: 'int',    value: result | 0 }; // truncate to int
    }
  }

  private valuesEqual(a: Value, b: Value): boolean {
    if (a.kind === 'null' && b.kind === 'null') return true;
    if (a.kind === 'ref'  && b.kind === 'ref')  return a.objectId === b.objectId;
    if (a.kind === 'ref'  && b.kind === 'null') return false;
    if (a.kind === 'null' && b.kind === 'ref')  return false;
    if ('value' in a && 'value' in b) return a.value === b.value;
    return false;
  }

  private valueToString(v: Value): string {
    switch (v.kind) {
      case 'int':
      case 'long':
      case 'double':
      case 'float':   return String(v.value);
      case 'boolean': return String(v.value);
      case 'char':    return v.value;
      case 'null':    return 'null';
      case 'ref':     return `<${v.objectId}>`;
      default:        return '?';
    }
  }

  // ── Lock / Monitor management (Phase 2) ────────────────────────────────────

  private acquireMonitor(objectId: string, threadId: string, lineHint: number | null) {
    let lock = this.locks.get(objectId);
    const thread = this.getOrCreateThread(threadId);

    if (!lock) {
      // First acquire - create lock
      lock = {
        owner: threadId,
        depth: 1,
        waitQueue: [],
        acquiredAt: this.steps.length,
      };
      this.locks.set(objectId, lock);
      thread.status = 'RUNNABLE';
      thread.waitingOn = null;
      thread.waitUntilTick = null;
      thread.waitingLine = null;

      // Emit monitor_enter delta
      this.emitStep(lineHint, {
        operation: 'monitor_enter',
        description: `monitor_enter — ${threadId} acquired lock on ${objectId}`,
        highlightedElements: [{ region: 'heap', elementId: objectId }],
        newArrows: [],
        fadingArrows: [],
        monitorOperation: {
          kind: 'monitor_enter',
          objectId,
          threadId,
          markWord: { kind: 'thin-locked', threadId },
        },
      });
    } else if (lock.owner === threadId) {
      // Reentrant lock - same thread acquiring again
      lock.depth++;
      thread.status = 'RUNNABLE';
      thread.waitingOn = null;
      thread.waitUntilTick = null;
      thread.waitingLine = null;

      this.emitStep(lineHint, {
        operation: 'monitor_enter',
        description: `monitor_enter — ${threadId} reentrant lock depth now ${lock.depth}`,
        highlightedElements: [{ region: 'heap', elementId: objectId }],
        newArrows: [],
        fadingArrows: [],
        monitorOperation: {
          kind: 'monitor_enter',
          objectId,
          threadId,
          markWord: { kind: 'thin-locked', threadId },
        },
      });
    } else if (lock.owner === null) {
      // Released lock with queued waiters: only queue head may acquire next (fair handoff).
      const queueHead = lock.waitQueue[0] ?? null;
      if (queueHead === threadId || queueHead === null) {
        if (queueHead === threadId) lock.waitQueue.shift();
        lock.owner = threadId;
        lock.depth = 1;
        lock.acquiredAt = this.steps.length;
        thread.status = 'RUNNABLE';
        thread.waitingOn = null;
        thread.waitUntilTick = null;
        thread.waitingLine = null;

        this.emitStep(lineHint, {
          operation: 'monitor_enter',
          description: `monitor_enter — ${threadId} acquired lock on ${objectId}`,
          highlightedElements: [{ region: 'heap', elementId: objectId }],
          newArrows: [],
          fadingArrows: [],
          monitorOperation: {
            kind: 'monitor_enter',
            objectId,
            threadId,
            markWord: { kind: 'thin-locked', threadId },
          },
        });
      } else {
        if (!lock.waitQueue.includes(threadId)) {
          lock.waitQueue.push(threadId);
        }
        thread.status = 'WAITING_ON_LOCK';
        thread.waitingOn = objectId;
        thread.waitUntilTick = null;
        thread.waitingLine = lineHint;

        this.emitStep(lineHint, {
          operation: 'monitor_enter',
          description: `monitor_enter — ${threadId} waiting for lock handoff on ${objectId}`,
          highlightedElements: [{ region: 'heap', elementId: objectId }],
          newArrows: [],
          fadingArrows: [],
          monitorOperation: {
            kind: 'monitor_enter',
            objectId,
            threadId,
            markWord: 'unlocked',
          },
        });
      }
    } else {
      // Lock held by another thread - add to wait queue
      if (!lock.waitQueue.includes(threadId)) {
        lock.waitQueue.push(threadId);
      }
      thread.status = 'WAITING_ON_LOCK';
      thread.waitingOn = objectId;
      thread.waitUntilTick = null;
      thread.waitingLine = lineHint;

      this.emitStep(lineHint, {
        operation: 'monitor_enter',
        description: `monitor_enter — ${threadId} waiting for lock held by ${lock.owner}`,
        highlightedElements: [{ region: 'heap', elementId: objectId }],
        newArrows: [],
        fadingArrows: [],
        monitorOperation: {
          kind: 'monitor_enter',
          objectId,
          threadId,
          markWord: { kind: 'thin-locked', threadId: lock.owner },
        },
      });

      const deadlockCycle = this.detectDeadlockCycle(threadId);
      if (deadlockCycle) {
        throw new InterpreterHalt({
          kind: 'runtime_error',
          message: `Deadlock detected: ${deadlockCycle.join(' -> ')}`,
        });
      }
    }
  }

  private releaseMonitor(objectId: string, threadId: string, lineHint: number | null) {
    const lock = this.locks.get(objectId);
    if (!lock || lock.owner !== threadId) {
      throw new InterpreterHalt({ kind: 'runtime_error', message: `monitor_exit: ${threadId} does not own lock on ${objectId}` });
    }

    lock.depth--;

    if (lock.depth === 0) {
      // Fully released; wake one waiter but let it explicitly re-acquire on resume.
      lock.owner = null;
      const nextWaiter = lock.waitQueue[0];
      if (nextWaiter) {
        lock.depth = 0;
        const thread = this.getOrCreateThread(nextWaiter);
        thread.status = 'RUNNABLE';
        thread.waitingOn = null;
        thread.waitUntilTick = null;
        thread.waitingLine = null;
      } else {
        // No waiters, remove lock
        this.locks.delete(objectId);
      }
    }

    this.emitStep(lineHint, {
      operation: 'monitor_exit',
      description: `monitor_exit — ${threadId} released lock on ${objectId} (depth now ${lock?.depth ?? 0})`,
      highlightedElements: [{ region: 'heap', elementId: objectId }],
      newArrows: [],
      fadingArrows: [],
      monitorOperation: {
        kind: 'monitor_exit',
        objectId,
        threadId,
          markWord: lock && lock.owner && lock.depth > 0 ? { kind: 'thin-locked', threadId: lock.owner } : 'unlocked',
      },
    });
  }

  private detectDeadlockCycle(startThreadId: string): string[] | null {
    const path: string[] = [];
    const visiting = new Set<string>();

    const dfs = (threadId: string): string[] | null => {
      const thread = this.threads.get(threadId);
      if (!thread || !thread.waitingOn) return null;

      if (visiting.has(threadId)) {
        const idx = path.indexOf(threadId);
        return idx >= 0 ? [...path.slice(idx), threadId] : [threadId, threadId];
      }

      visiting.add(threadId);
      path.push(threadId);

      const lock = this.locks.get(thread.waitingOn);
      if (!lock || !lock.owner) {
        path.pop();
        visiting.delete(threadId);
        return null;
      }

      const ownerThreadId = lock.owner;
      const cycle = dfs(ownerThreadId);
      if (cycle) return cycle;

      path.pop();
      visiting.delete(threadId);
      return null;
    };

    return dfs(startThreadId);
  }
}

// ── Public factory ────────────────────────────────────────────────────────────

export function interpret(program: Program, opts?: { threadDirectives?: ThreadDirective[] }): TraceResult {
  return new JavaInterpreter(opts).interpret(program);
}

export interface ThreadExecutionSession {
  initial: TraceResult;
  stepThread: (threadId: string) => ThreadSteppingState;
  drain: () => ThreadSteppingState;
  pendingThreads: () => string[];
}

export function createThreadExecutionSession(
  program: Program,
  opts?: { threadDirectives?: ThreadDirective[] },
): ThreadExecutionSession {
  const interpreter = new JavaInterpreter(opts);
  const initial = interpreter.interpret(program, { deferWorkerThreads: true });

  return {
    initial,
    stepThread: (threadId: string) => interpreter.stepThreadOnce(threadId),
    drain: () => interpreter.drainThreads(),
    pendingThreads: () => interpreter.pendingThreadIds(),
  };
}
