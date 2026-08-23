# Phase 2 — Parser Analysis & Code Change Plan

## Status Snapshot (2026-08-23)
- This document is now primarily historical planning context.
- Implemented in engine/parser/runtime: synchronized and volatile handling, thread directives/session stepping flow, and Thread API subset wiring (`Thread(String)`, `Thread(Runnable)`, `Thread(Runnable, String)`, `start`, `join`, `join(timeout)`, `sleep`).
- Implemented in runtime state model: `WAITING_ON_THREAD` plus timeout wake-up steps.
- Parser sweep and thread regression scripts exist under engine language tests/tools and are passing in the latest validation run.

## Parser Output Analysis

### 1. Synchronized Method
**CST Structure:**
```
methodDeclaration
  ├─ methodModifier
  │   └─ Synchronized (TOKEN)
  ├─ methodHeader
  │   └─ methodDeclarator (name, params)
  │       └─ result (return type)
  └─ methodBody
      └─ block (statements)
```

**What We Need**: Detect `methodModifier.Synchronized` token and mark the method.

**Current Parser Handling**: In `transformMethodDecl()` in parser.ts, add:
```typescript
const isSynchronized = node.children?.methodModifier?.some(
  (mod: any) => mod.children?.Synchronized?.length > 0
);
```

---

### 2. Volatile Field
**CST Structure:**
```
fieldDeclaration
  ├─ fieldModifier
  │   └─ Volatile (TOKEN)
  ├─ unannType (type)
  ├─ variableDeclaratorList (names + initializers)
  └─ Semicolon
```

**What We Need**: Detect `fieldModifier.Volatile` token and flag the field.

**Current Parser Handling**: In `transformFieldDecl()` in parser.ts, add:
```typescript
const isVolatile = node.children?.fieldModifier?.some(
  (mod: any) => mod.children?.Volatile?.length > 0
);
```

---

### 3. Synchronized Statement (Block)
**CST Structure:**
```
synchronizedStatement
  ├─ Synchronized (TOKEN)
  ├─ LBrace ( "(" token)
  ├─ expression (what's being locked, e.g., `this`, `lock`, `obj.field`)
  ├─ RBrace ( ")" token)
  └─ block (the synchronized body)
      └─ blockStatements (list of statements)
```

**What We Need**: Transform this into our AST `SynchronizedStmt` node.

**Key Point**: The `expression` is what's being locked. It can be:
- `this` (simple Identifier)
- `lock` (variable reference)
- `obj.field` (field access)
- Any expression that evaluates to an object

**Current Parser Handling**: Add new case in `transformStatement()`:
```typescript
case 'synchronizedStatement':
  const syncExpr = node.children?.expression?.[0];
  const syncBlock = node.children?.block?.[0];
  return {
    kind: 'SynchronizedStmt',
    expr: transformExpr(syncExpr),
    body: transformBlock(syncBlock),
    loc: loc(node),
  };
```

---

### 4. Comments (DSL Thread Directives)
**Issue**: java-parser **does not preserve comments by default**.

**Workaround**: Pre-process source before parsing:
```typescript
// Extract all // @thread lines from raw source
const dslThreads = src.split('\n')
  .filter(line => line.includes('// @thread'))
  .map(line => {
    const match = line.match(/@thread\s+"([^"]+)"\s*{\s*run:\s*(.+?)\s*}/);
    if (match) return { id: match[1], code: match[2] };
  })
  .filter(Boolean);

// Parse the code with DSL comments stripped (to avoid parser errors)
const cleanSrc = src.split('\n')
  .filter(line => !line.includes('@thread'))
  .join('\n');

const ast = parseJava(cleanSrc);
```

Then, in the interpreter, recognize these DSL threads when main() is invoked and spin up thread execution.

---

## Code Changes Required

### 1. **types.ts** — Add Thread & Monitor Types

```typescript
// NEW: Mark word states for object header
export type MarkWordState =
  | { kind: 'unlocked' }
  | { kind: 'thin-locked'; threadId: string }
  | { kind: 'fat-locked'; threadId: string };

// NEW: Monitor state for synchronization
export interface MonitorState {
  owner: string;       // threadId holding lock
  depth: number;       // reentrant depth
  waitQueue: string[]; // threadIds waiting
  acquiredAt: number;  // step index when acquired
}

// NEW: Thread status enum
export type ThreadStatus = 'CREATED' | 'RUNNABLE' | 'WAITING_ON_LOCK' | 'TERMINATED';

// EXTEND: StackFrame
export interface StackFrame {
  frameId:      string;
  threadId:     string;              // ← NEW
  className:    string;
  methodName:   string;
  descriptor:   string;
  lineNumber:   number | null;
  locals:       Map<string, Value>;
  operandStack: Value[];
}

// EXTEND: HeapObject
export interface HeapObject {
  objectId:     string;
  klassName:    string;
  header:       ObjectHeader;
  fields:       Map<string, Value>;
  markWord:     MarkWordState;        // ← NEW
  monitor:      MonitorState | null;  // ← NEW
}

// EXTEND: Delta
export interface Delta {
  // ... existing ...
  
  monitorOperation?: {                // ← NEW
    kind:      'monitor_enter' | 'monitor_exit';
    objectId:  string;
    threadId:  string;
    markWord:  MarkWordState;
  };
}

// EXTEND: Step
export interface Step {
  // ... existing ...
  activeThreadId:    string;          // ← NEW: which thread owns this step
  threadStates:      Map<string, ThreadStatus>;  // ← NEW: all thread status
}
```

**Time**: 20 min

---

### 2. **ast.ts** — Add Synchronized & Volatile Nodes

```typescript
// NEW: Synchronized statement (block)
export interface SynchronizedStmt extends Statement {
  kind: 'SynchronizedStmt';
  expr: Expr;        // object being locked
  body: Statement[];
  loc: SourceLoc;
}

// EXTEND: FieldDecl with volatile flag
export interface FieldDecl {
  kind: 'FieldDecl';
  name: string;
  type: TypeAnnotation;
  initializer?: Expr;
  isStatic: boolean;
  isVolatile: boolean;   // ← NEW
  loc: SourceLoc;
}

// EXTEND: MethodDecl with synchronized flag
export interface MethodDecl {
  kind: 'MethodDecl';
  name: string;
  params: ParameterDecl[];
  returnType: TypeAnnotation;
  body: Statement[];
  isStatic: boolean;
  isSynchronized: boolean;  // ← NEW
  loc: SourceLoc;
}

// EXTEND: Statement union
export type Statement =
  // ... existing ...
  | SynchronizedStmt;  // ← NEW
```

**Time**: 15 min

---

### 3. **parser.ts** — Handle Synchronized & Volatile

**3A: Extract volatile flag from fields**
```typescript
// In transformFieldDecl()
const isVolatile = node.children?.fieldModifier?.some(
  (mod: any) => mod.children?.Volatile?.length > 0
);

return {
  kind: 'FieldDecl',
  name,
  type,
  initializer,
  isStatic,
  isVolatile,  // ← ADD THIS
  loc: nodeLoc,
};
```

**3B: Extract synchronized flag from methods**
```typescript
// In transformMethodDecl()
const isSynchronized = node.children?.methodModifier?.some(
  (mod: any) => mod.children?.Synchronized?.length > 0
);

return {
  kind: 'MethodDecl',
  name,
  params,
  returnType,
  body,
  isStatic,
  isSynchronized,  // ← ADD THIS
  loc: nodeLoc,
};
```

**3C: Handle synchronized statements**
```typescript
// In transformStatement(), add case:
if (node.name === 'synchronizedStatement') {
  const c = node.children ?? {};
  const syncExpr = c.expression?.[0];
  const syncBlock = c.block?.[0];
  
  if (!syncExpr) throw new ParseError(`synchronized without expression at line ${loc(node).line}`);
  if (!syncBlock) throw new ParseError(`synchronized without block at line ${loc(node).line}`);
  
  return {
    kind: 'SynchronizedStmt',
    expr: transformExpr(syncExpr),
    body: extractBlockStatements(syncBlock),
    loc: loc(node),
  };
}
```

**3D: Handle DSL thread comments**
```typescript
// NEW: Scan raw source for @thread directives before parsing
function extractThreadDirectives(src: string): Map<string, string> {
  const threads = new Map<string, string>();
  const lines = src.split('\n');
  
  for (const line of lines) {
    const match = line.match(/@thread\s+"([^"]+)"\s*{\s*run:\s*(.+?)\s*}/);
    if (match) {
      const [, threadId, code] = match;
      threads.set(threadId, code.trim());
    }
  }
  
  return threads;
}

// Call this in parseJava() before parsing
export function parseJava(src: string): Program {
  // ... store thread directives somewhere accessible ...
  const threadDirectives = extractThreadDirectives(src);
  
  // ... parse normally ...
  // Then return with thread info attached
}
```

**Time**: 45 min

---

### 4. **interpreter.ts** — Thread Execution Model

**4A: Add thread state tracking**
```typescript
interface ThreadState {
  threadId: string;
  status: ThreadStatus;
  callStack: RuntimeFrame[];
  nextObjectId: number;  // thread-local? or shared?
}

export class JavaInterpreter {
  private threads = new Map<string, ThreadState>();
  private currentThreadId = 'main';
  private sharedHeap = new Map<string, RuntimeObject>();
  private sharedMetaspace: KlassInfo[] = [];
  
  // ... rest of interpreter ...
}
```

**4B: Refactor to thread-based execution**
```typescript
// Save/restore current thread's state
private saveThreadState() {
  const thread = this.threads.get(this.currentThreadId)!;
  thread.callStack = this.callStack;
}

private loadThreadState() {
  const thread = this.threads.get(this.currentThreadId)!;
  this.callStack = thread.callStack;
}

// Step just one thread
stepThread(threadId: string) {
  this.saveThreadState();
  this.currentThreadId = threadId;
  this.loadThreadState();
  
  // Execute one statement
  // ...
  
  this.saveThreadState();
}
```

**4C: Handle synchronized statements**
```typescript
case 'SynchronizedStmt': {
  const obj = this.evalExpr(stmt.expr);
  
  if (obj.kind !== 'object') {
    throw new InterpreterHalt({
      kind: 'runtime_error',
      message: `Cannot synchronize on non-object at line ${stmt.loc.line}`
    });
  }
  
  // Acquire monitor
  this.acquireMonitor(obj.objectId, this.currentThreadId);
  this.emitStep({
    op: 'monitor_enter',
    monitorOperation: {
      kind: 'monitor_enter',
      objectId: obj.objectId,
      threadId: this.currentThreadId,
      markWord: obj.markWord,
    },
  });
  
  // Execute body
  try {
    this.executeStatements(stmt.body, stmt.loc.line);
  } finally {
    // Release monitor
    this.releaseMonitor(obj.objectId, this.currentThreadId);
    this.emitStep({
      op: 'monitor_exit',
      monitorOperation: {
        kind: 'monitor_exit',
        objectId: obj.objectId,
        threadId: this.currentThreadId,
        markWord: { kind: 'unlocked' },
      },
    });
  }
}
```

**4D: Lock acquisition**
```typescript
private acquireMonitor(objectId: string, threadId: string) {
  const obj = this.sharedHeap.get(objectId)!;
  
  if (!obj.monitor) {
    // First acquisition - thin lock
    obj.monitor = { owner: threadId, depth: 1, waitQueue: [], acquiredAt: this.steps.length };
    obj.markWord = { kind: 'thin-locked', threadId };
  } else if (obj.monitor.owner === threadId) {
    // Reentrant
    obj.monitor.depth++;
  } else {
    // Contention - block this thread
    obj.monitor.waitQueue.push(threadId);
    const thread = this.threads.get(threadId)!;
    thread.status = 'WAITING_ON_LOCK';
    // Throw or return to pause this thread
    throw new InterpreterHalt({
      kind: 'runtime_error',
      message: `Thread ${threadId} blocked waiting for lock on ${obj.klassName}`
    });
  }
}

private releaseMonitor(objectId: string, threadId: string) {
  const obj = this.sharedHeap.get(objectId)!;
  
  if (!obj.monitor || obj.monitor.owner !== threadId) {
    throw new InterpreterHalt({
      kind: 'runtime_error',
      message: `Thread ${threadId} does not own monitor on ${obj.klassName}`
    });
  }
  
  obj.monitor.depth--;
  if (obj.monitor.depth === 0) {
    obj.markWord = { kind: 'unlocked' };
    
    // Wake first waiter
    if (obj.monitor.waitQueue.length > 0) {
      const waiterThreadId = obj.monitor.waitQueue.shift()!;
      const waiter = this.threads.get(waiterThreadId)!;
      waiter.status = 'RUNNABLE';
      obj.monitor.owner = waiterThreadId;
      obj.monitor.depth = 1;
      obj.markWord = { kind: 'thin-locked', threadId: waiterThreadId };
    }
  }
}
```

**4E: Synchronized methods**
When a method has `isSynchronized = true`, wrap its body:
```typescript
// Before executing method body, acquire lock on `this`
if (method.isSynchronized && thisRef) {
  this.acquireMonitor(thisRef.objectId, this.currentThreadId);
}

// Execute body
// ...

// After, release lock
if (method.isSynchronized && thisRef) {
  this.releaseMonitor(thisRef.objectId, this.currentThreadId);
}
```

**4F: Process DSL threads**
```typescript
// In JavaInterpreter constructor or run(), after class loading:
private processDSLThreads(threadDirectives: Map<string, string>) {
  for (const [threadId, code] of threadDirectives) {
    // Parse `code` as an expression
    const exprAst = parseJava(`class _ { void m() { ${code}; } }`);
    
    // Create thread state
    const thread: ThreadState = {
      threadId,
      status: 'RUNNABLE',
      callStack: [
        // Frame pointing to the DSL code
        {
          frameId: `frame-${threadId}`,
          threadId,
          className: 'DSL',
          methodName: 'run',
          descriptor: '()',
          locals: new Map(),
          operandStack: [],
          lineNumber: null,
        }
      ],
    };
    
    this.threads.set(threadId, thread);
  }
}
```

**Time**: 2 hours

---

## Summary of Changes

| File | Change | Impact | Time |
|------|--------|--------|------|
| `types.ts` | Add `MarkWordState`, `MonitorState`, thread fields | Foundation | 20m |
| `ast.ts` | Add `SynchronizedStmt`, `isVolatile`, `isSynchronized` | AST nodes | 15m |
| `parser.ts` | Extract volatile/sync modifiers, handle sync statements, DSL | Parser transforms | 45m |
| `interpreter.ts` | Thread refactor, lock logic, DSL thread spawn | Execution model | 2h |
| **Total** | | | **3h 20m** |

---

## Next Steps

1. ✅ **Understand parser** — Done (this analysis)
2. **Implement types.ts changes**
3. **Implement ast.ts changes**
4. **Implement parser.ts changes**
5. **Implement interpreter.ts changes**
6. **Test with Phase 2 program**

Ready to start with types.ts?
