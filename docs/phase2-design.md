# Phase 2 Design — Multithreading & Concurrency

## Implementation Status (2026-08-23)
- Engine supports Thread API subset used in examples: `start`, `join`, `join(timeout)`, `sleep`, and Thread constructors with name and Runnable target wiring.
- Runtime models `WAITING_ON_LOCK` and `WAITING_ON_THREAD`, including timeout wake-up steps for join/sleep waits.
- Renderer supports thread-session controls (`Step Thread`, `Run All`) and stack thread-name badges.
- Fresh run playback now begins at step 1 (index 0) instead of jumping to the final step.

## Vision
Visualize **race conditions** by allowing the user to manually step individual threads through a shared heap. Initially optimize for 2-thread workflows, but architect for N threads.

---

## 1. Thread Model

### Thread Lifecycle
```
CREATED → RUNNABLE ←→ WAITING_ON_LOCK → TERMINATED
                 ↘ WAITING_ON_THREAD ↗
```

### Thread State (Runtime)
Each thread owns:
- **Call stack** (separate stack frames per thread)
- **Local variables** (frame-local, thread-private)
- **Operand stack** (temporary stack per frame, thread-private)
- **Thread ID** (string: "Thread-0", "Thread-1", "main")
- **Status** (RUNNABLE, WAITING_ON_LOCK, WAITING_ON_THREAD, TERMINATED)
- **Monitor wait queue** (if waiting for a lock)

### Shared Resources
- **Heap** (all threads see same objects)
- **Metaspace** (all threads see same classes)
- **Mark word on each object** (per-object lock state)

---

## 2. UI Layout Architecture

### Current (Single Thread)
```
┌──────────────────────────────────────────────────────────────┐
│  Stack (main thread)  │  Heap  │  Metaspace  │  Code Panel  │
└──────────────────────────────────────────────────────────────┘
```

### Phase 2 (2 Threads — Optimized)
```
┌─────────────────────────────────────────────────────────────────┐
│ Thread-0 Stack  │  Shared Heap  │  Thread-1 Stack  │  Code     │
│                 │               │                  │  Panel    │
└─────────────────────────────────────────────────────────────────┘
                    Metaspace (bottom)
```

### Phase 2 (N Threads — Scalable)
```
┌───────────────────────────────────────────────────────────────────┐
│  Thread Selector  (dropdown or tabs)                              │
├───────────────────────────────────────────────────────────────────┤
│  Thread-0  │  Thread-1  │  Thread-2  │ ...  (scrollable)        │
│  Stack     │  Stack     │  Stack     │                          │
├───────────────────────────────────────────────────────────────────┤
│  [[ Shared Heap (center, always visible) ]]                      │
├───────────────────────────────────────────────────────────────────┤
│  Metaspace (bottom)                                              │
│  Code Panel (right side, persistent)                             │
└───────────────────────────────────────────────────────────────────┘
```

### Component Changes

#### `packages/renderer/src/App.tsx`
- Add thread selector state: `activeThreadIds: string[]` (initially `["main"]`)
- Add thread layout mode: `layoutMode: '2-thread' | 'n-thread'`
- Render thread controls above step controls

#### `packages/renderer/src/components/ThreadSelector.tsx` (NEW)
```
Dropdown or Tab Set:
  ☐ Thread-0 (main) [active ←]
  ☐ Thread-1 (Worker)
  ☐ Thread-2 (Worker)
  + New Thread (at end)

Buttons:
  [Step Thread-0] [Step Thread-1] [Step All] [Auto] [Pause]
```

#### `packages/renderer/src/components/StackPanel.tsx`
- Update to show thread ID in header: `"Stack — Thread-0"`
- Add thread color accent (left border): `border-left: 4px solid var(--thread-0-color)`
- Thread colors: Thread-0 = blue, Thread-1 = purple, Thread-2 = green, etc.

#### `packages/renderer/src/components/HeapPanel.tsx`
- Objects now display mark word badge in header
- Badge format: `🔓 unlocked` | `🔒 Thread-0` | `🔐 Thread-0 (×3)`
- Badge color matches thread color (if locked)
- On mark word change, pulse animation (150ms)

#### `packages/renderer/src/components/ArrowOverlay.tsx`
- Sync block arrows: `monitor_enter` (solid red, thick) + `monitor_exit` (dashed red)
- Different visual style from vtable/itable arrows (which are blue/teal)
- Arrow label: "monitor enter on obj-123" or "acquire lock"

#### `packages/renderer/src/store/trace.store.ts`
- Add `activeThread: string` (which thread to step next)
- Add `threadColors: Map<string, string>` (computed from thread ID)
- Stepper callback: `stepThread(threadId: string)` instead of just `stepForward()`

---

## 3. Step Type Contract (types.ts)

### Extend `StackFrame`
```typescript
export interface StackFrame {
  frameId:      string;
  threadId:     string;              // NEW: which thread owns this frame
  className:    string;
  methodName:   string;
  descriptor:   string;
  lineNumber:   number | null;
  locals:       Map<string, Value>;
  operandStack: Value[];
}
```

### Extend `HeapObject`
```typescript
export interface HeapObject {
  objectId:     string;
  klassName:    string;
  header:       ObjectHeader;
  fields:       Map<string, Value>;
  markWord:     MarkWordState;         // NEW
  monitor:      MonitorState | null;   // NEW
}

export type MarkWordState =
  | { kind: 'unlocked' }
  | { kind: 'thin-locked'; threadId: string }
  | { kind: 'fat-locked'; threadId: string; depth: number };

export interface MonitorState {
  owner:       string;                 // threadId holding the lock
  depth:       number;                 // reentrant lock depth
  waitQueue:   string[];               // threadIds waiting for lock
  acquiredAt:  number;                 // step index when lock acquired
}
```

### Extend `Delta` (what changed in this step)
```typescript
export interface Delta {
  // ... existing fields ...
  
  // Thread-specific deltas
  threadId:            string;                // which thread executed this step
  threadStatusChange?: { threadId: string; from: ThreadStatus; to: ThreadStatus };
  
  // Monitor operations (NEW)
  monitorOperation?: {
    kind:      'monitor_enter' | 'monitor_exit' | 'monitor_notify' | 'monitor_wait';
    objectId:  string;
    threadId:  string;
    markWord:  MarkWordState;              // new mark word state after operation
  };
}

export type ThreadStatus = 'CREATED' | 'RUNNABLE' | 'WAITING_ON_LOCK' | 'TERMINATED';
```

### Extend `Step`
```typescript
export interface Step {
  // ... existing fields ...
  
  activeThreadId:    string;           // which thread is "current" on this step
  threadStates:      Map<string, ThreadStatus>;  // all thread statuses
}
```

---

## 4. Parser & AST Changes (ast.ts + parser.ts)

### AST Nodes (ast.ts)

```typescript
export interface SynchronizedStmt extends Statement {
  kind: 'SynchronizedStmt';
  expr: Expr;              // the object being locked (usually `this`)
  body: Statement[];
  loc: SourceLoc;
}

// Add to ClassDecl FieldDecl
export interface FieldDecl {
  kind: 'FieldDecl';
  name: string;
  type: TypeAnnotation;
  initializer?: Expr;
  isStatic: boolean;
  isVolatile: boolean;      // NEW
  loc: SourceLoc;
}
```

### Parser (parser.ts)

- Add case for `synchronized` keyword in `statementWithoutTrailing()`
- Parse: `synchronized (expr) { statements }`
- Extract type name from `expr` (usually `Identifier` for `this`)
- Add `volatile` modifier parsing in field declarations

---

## 5. Interpreter Architecture (interpreter.ts)

### Thread Context Manager
```typescript
interface ThreadState {
  threadId:        string;
  status:          ThreadStatus;
  callStack:       RuntimeFrame[];
  heap:            Map<string, RuntimeObject>;  // shared ref to main heap
  stdout:          string[];                     // thread-local? or shared?
  nextStepIndex:   number;
}

class JavaInterpreter {
  private threads = new Map<string, ThreadState>();
  private currentThreadId = 'main';
  private sharedHeap = new Map<string, RuntimeObject>();
  private sharedMetaspace: KlassInfo[] = [];
  
  // ... existing methods ...
}
```

### Thread Stepping
```typescript
// NEW method
stepThread(threadId: string): TraceResult {
  const thread = this.threads.get(threadId);
  if (!thread) throw new Error(`Thread ${threadId} not found`);
  
  // Save interpreter state
  this.currentThreadId = threadId;
  this.callStack = thread.callStack;
  
  // Execute one statement/expression
  // ...
  
  // Restore state back to thread
  thread.callStack = this.callStack;
  
  // Emit step with threadId
  this.emitStep(..., { threadId });
}
```

### Synchronized Block Execution
```typescript
case 'SynchronizedStmt': {
  const obj = this.evalExpr(stmt.expr);
  
  if (obj.kind !== 'object') {
    throw new InterpreterHalt({ 
      kind: 'runtime_error', 
      message: 'Cannot synchronize on non-object'
    });
  }
  
  // Acquire lock
  this.acquireMonitor(obj, this.currentThreadId);
  this.emitStep({
    op: 'monitor_enter',
    mark_word_change: { to: 'thin-locked', by: this.currentThreadId }
  });
  
  // Execute body
  try {
    this.executeStatements(stmt.body, stmt.loc.line);
  } finally {
    // Release lock
    this.releaseMonitor(obj, this.currentThreadId);
    this.emitStep({
      op: 'monitor_exit',
      mark_word_change: { to: 'unlocked' }
    });
  }
}
```

### Lock Acquisition
```typescript
private acquireMonitor(obj: RuntimeObject, threadId: string): void {
  if (!obj.monitor) {
    // First time — thin lock
    obj.monitor = { owner: threadId, depth: 1, waitQueue: [], acquiredAt: this.steps.length };
    obj.markWord = { kind: 'thin-locked', threadId };
  } else if (obj.monitor.owner === threadId) {
    // Reentrant lock
    obj.monitor.depth++;
  } else {
    // Conflict — add to wait queue, mark as WAITING_ON_LOCK
    obj.monitor.waitQueue.push(threadId);
    this.getThread(threadId).status = 'WAITING_ON_LOCK';
    // Block this thread; user must step another thread to release lock
  }
}

private releaseMonitor(obj: RuntimeObject, threadId: string): void {
  if (!obj.monitor || obj.monitor.owner !== threadId) {
    throw new InterpreterHalt({ 
      kind: 'runtime_error', 
      message: `Thread ${threadId} does not own monitor on ${obj.klassName}`
    });
  }
  
  obj.monitor.depth--;
  if (obj.monitor.depth === 0) {
    obj.markWord = { kind: 'unlocked' };
    
    // Wake up first waiter, if any
    if (obj.monitor.waitQueue.length > 0) {
      const waitingThreadId = obj.monitor.waitQueue.shift()!;
      this.getThread(waitingThreadId).status = 'RUNNABLE';
      obj.monitor.owner = waitingThreadId;
      obj.monitor.depth = 1;
      obj.markWord = { kind: 'thin-locked', threadId: waitingThreadId };
    }
  }
}
```

### Thread Creation (Pattern Recognition)
```typescript
// In evalNew() or evalMethodCall() for Thread.start()
if (className === 'Thread' && method === 'start') {
  const newThreadId = `Thread-${this.nextThreadId++}`;
  const runMethod = this.findMethod(className, 'run', 0);
  
  const newThread: ThreadState = {
    threadId: newThreadId,
    status: 'RUNNABLE',
    callStack: [
      // Create initial frame for run()
    ],
    // ...
  };
  
  this.threads.set(newThreadId, newThread);
  this.emitStep({ op: 'thread_start', threadId: newThreadId });
}
```

---

## 6. Stepping Model

### Manual Mode (Default for Phase 2)
```typescript
// Renderer calls:
store.stepThread('Thread-0');  // Execute one statement in Thread-0
store.stepThread('Thread-1');  // Execute one statement in Thread-1
store.stepThread('Thread-0');  // Thread-0 again
```

User constructs the interleavings manually. This is **intentional** — race conditions are visible because the user has to construct them step-by-step.

### Round-Robin Mode (Optional)
```
[Auto] button → step Thread-0, Thread-1, Thread-2, ... in order
```

### Auto-Scheduler Mode (Stretch)
Attempt pseudo-realistic scheduling (but deterministic for reproducibility):
- Run each thread for N steps
- Switch threads on I/O or lock contention
- Not the goal for Phase 2; manual mode is the focus

---

## 7. Color System (Design Spec from copilot-instructions.md)

### Region Colors (unchanged)
- **Stack** = Indigo/blue (`#4f46e5`)
- **Heap** = Amber/gold (`#f59e0b`)
- **Metaspace** = Teal/cyan (`#14b8a6`)

### Thread Accent Colors (NEW)
- **Thread-0** = Blue border (`#3b82f6`)
- **Thread-1** = Purple border (`#a855f7`)
- **Thread-2** = Green border (`#10b981`)
- **Thread-3** = Orange border (`#f97316`)
- (cycle: blue → purple → green → orange → red → teal → ...)

### Monitor/Lock Colors (NEW)
- **monitor_enter arrow** = Solid red (`#ef4444`), thick (3px)
- **monitor_exit arrow** = Dashed red (`#ef4444`), 2px
- **Mark word badge** = Matches thread color if locked

### Badge Design
```
┌─────────────────────────┐
│ 🔓 unlocked             │  (gray icon, neutral)
│ 🔒 Thread-0 (×1)        │  (red icon, blue text)
│ 🔐 Thread-1 (×3)        │  (red icon, purple text)
└─────────────────────────┘
```

---

## 8. Implementation Roadmap (Phase 2)

### Checkpoint 1: Type Contract
- Extend `types.ts` with `MarkWordState`, `MonitorState`, thread fields
- PR: "types: add thread & monitor state to Step"

### Checkpoint 2: Parser & AST
- Add `SynchronizedStmt`, `volatile` flag
- PR: "parser: add synchronized and volatile support"

### Checkpoint 3: Interpreter — Single-Thread Mode
- Refactor to thread-based model (all code runs in "main" thread)
- Implement lock acquire/release logic
- Handle `SynchronizedStmt` (no actual blocking yet)
- PR: "interpreter: thread context refactor"

### Checkpoint 4: Interpreter — Multi-Thread Support
- Thread creation (`Thread()` constructor, `.start()` method)
- Manual stepping per thread
- Monitor wait queue, blocking behavior
- PR: "interpreter: multi-thread execution with manual stepping"

### Checkpoint 5: Renderer
- `ThreadSelector.tsx` component
- Multi-stack layout for 2 threads
- Mark word badge in `HeapPanel.tsx`
- Thread-colored borders on `StackPanel.tsx`
- PR: "renderer: thread selector and multi-thread layout"

### Checkpoint 6: Integration & Testing
- 2-thread race condition test program
- Regression test: Phase 0/1.5 still pass
- PR: "test: phase 2 race condition scenarios"

---

## 9. Constraints & Assumptions (Phase 2)

### ✅ In Scope
- **2 threads** optimized, N threads supported
- **Manual stepping** — user controls execution order
- **Thin/fat locks** — mark word visualization
- **Reentrant locking** (recursion depth)
- **Monitor wait queues** (basic)
- `synchronized` blocks (not yet methods)

### ❌ Out of Scope
- Real scheduler simulation
- `wait()` / `notify()` (Phase 2+)
- Volatile visibility guarantees (visual only, no happens-before)
- Thread priority, daemon threads
- Thread groups, thread pools

### Assumptions
- Each thread executes **one statement at a time** per step (fine-grained visibility)
- Locks are re-entrant (a thread can acquire the same lock multiple times)
- Wait queue is FIFO (first blocked thread wakes first)
- No timeout on lock waits (user must manually step the lock-holding thread to release)

---

## 10. Example Scenario — Race Condition Demo

### Program
```java
class Counter {
    int count = 0;
    void increment() { count++; }
}

class Main {
    static void main() {
        Counter c = new Counter();
        Thread t1 = new Thread(/* run: c.increment() */);
        Thread t2 = new Thread(/* run: c.increment() */);
        t1.start();
        t2.start();
    }
}
```

### User Steps
1. **Step main** → `new Counter()`, `new Thread(...)`, `t1.start()`, `t2.start()` → t1 & t2 now RUNNABLE
2. **Step Thread-0** (t1) → enter `increment()` → read `count` (0) onto operand stack
3. **Step Thread-1** (t2) → enter `increment()` → read `count` (0) onto operand stack ← **BUG: both threads saw 0**
4. **Step Thread-0** → `count++` → write 1 back to `count`
5. **Step Thread-1** → `count++` → write 1 back to `count` ← **Lost update: count is 1, not 2**
6. Renderer shows: Thread-0 stack + Heap (count=1) + Thread-1 stack, with arrows showing the read/write race

### With synchronized()
Same program, but `increment()` wrapped in `synchronized(this)`:
- Step Thread-0: `monitor_enter` on counter object → lock acquired, mark word = `🔒 Thread-0`
- Step Thread-1: `monitor_enter` attempts → **BLOCKS**, status = WAITING_ON_LOCK, queued in monitor wait queue
- Step Thread-0: execute body, `monitor_exit` → lock released, mark word = `🔓 unlocked`
- Step Thread-1: automatically awakens (mark word = `🔒 Thread-1`), continues
- Result: count = 2 ✅

---

## 11. Design Decisions — LOCKED ✅

### ✅ **Approved Decisions**

1. **UI Reuse**: Leverage existing layout structure — refactor to swap thread stacks dynamically instead of major redesign
2. **Mark word animation**: **YES** — pulse (150ms) on lock state change (thin → fat, locked → unlocked)
3. **Thread colors**: **4 fixed colors** (Thread-0=Blue, Thread-1=Purple, Thread-2=Green, Thread-3=Orange), then cycle
4. **Blocked thread visibility**: **Keep visible** with opacity reduction (40% opacity) + red text label ("WAITING_ON_LOCK") — makes lock contention obvious
5. **Thread creation DSL**: **Simplified** — user writes `// @thread "Worker"` comment in main() to spawn threads, not real Thread class pattern matching
6. **Pulse animation**: Only on mark word changes, respects `prefers-reduced-motion` CSS media query

### 📋 **Roadmap Futures** (document for Phase 2+)

#### Random Colors Per Thread (Roadmap)
Instead of fixed 4-color cycle, generate deterministic but pseudo-random colors:
```typescript
// Future: per-thread color generation
function threadColor(threadId: string): string {
  const hash = threadId.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
}
```
Store in `Zustand` store, persist across session if desired.

#### Extended DSL Features (Roadmap)
- `// @thread "Worker" { run: this.doWork() }` — specify what the thread does
- `// @barrier count=3` — wait for N threads to reach this point
- `// @lock obj` — force lock contention scenario

---

## 12. Existing UI Reuse Strategy

### What We Already Have
- **StackPanel.tsx**: renders `stack: StackFrame[]` + frame locals + line pointer
- **HeapPanel.tsx**: renders `heap: HeapObject[]` with object boxes
- **MetaspacePanel.tsx**: renders `metaspace: KlassInfo[]`
- **CodePanel.tsx**: syntax-highlighted source + line pointer
- **App.tsx**: Zustand store subscription, step controls
- **trace.store.ts**: Zustand store with `steps: Step[]`, `currentStepIndex`, stepper callbacks

### Minimal Refactor for Phase 2

#### 1. Store Changes (trace.store.ts)
```typescript
// Add to TraceStore
activeThreads: string[] = ['main'];  // threads to display
selectedThreadId: string = 'main';   // which thread to step next
threadColors = new Map<string, string>([
  ['main', '#3b82f6'],      // blue
  ['Thread-0', '#a855f7'],  // purple
  ['Thread-1', '#10b981'],  // green
  ['Thread-2', '#f97316'],  // orange
]);

stepThread(threadId: string) {
  // Interpreter steps just this thread
  // Emit new Step[] with threadId in delta
}
```

#### 2. StackPanel Changes
- Show `threadId` in header: `"Stack — Thread-0"` with color accent
- Add thread color as left border: `border-left: 4px solid var(--thread-0-color)`
- If thread is WAITING_ON_LOCK: add overlay label "🔒 Waiting" in red (40% opacity)
- Animate on mark word change (trigger from HeapPanel pulse)

```tsx
<div
  style={{
    borderLeft: `4px solid ${threadColor}`,
    opacity: isBlocked ? 0.6 : 1,
    transition: 'opacity 200ms'
  }}
>
  {isBlocked && <div className="blocked-label">🔒 Waiting for lock</div>}
  Stack — {threadId}
  {/* ... rest of stack ... */}
</div>
```

#### 3. HeapPanel Changes
- Extend object header with mark word badge
- Trigger pulse animation on `delta.monitorOperation`
- Color badge text by lock-holding thread

```tsx
<div className="object-header">
  <span className="object-id">{obj.objectId}</span>
  <span className="klass-name">{obj.klassName}</span>
  {obj.markWord && (
    <span
      className={`mark-word ${isLocked ? 'pulse' : ''}`}
      style={{ color: threadColor(obj.monitor?.owner) }}
    >
      {obj.markWord.kind === 'unlocked' && '🔓 unlocked'}
      {obj.markWord.kind === 'thin-locked' && `🔒 ${obj.monitor?.owner} (×${obj.monitor?.depth})`}
      {obj.markWord.kind === 'fat-locked' && `🔐 ${obj.monitor?.owner} (×${obj.monitor?.depth})`}
    </span>
  )}
</div>
```

#### 4. App.tsx Changes
- Add `ThreadSelector` dropdown (new small component)
- Add thread step buttons: `[Step Thread-0]` `[Step Thread-1]` (in addition to existing forward/back)
- Show all threads' statuses in a small indicator row

```tsx
<div className="thread-controls">
  <select value={selectedThreadId} onChange={...}>
    <option>main</option>
    <option>Thread-0</option>
    <option>Thread-1</option>
  </select>
  <button onClick={() => stepThread(selectedThreadId)}>Step {selectedThreadId}</button>
  <span className="thread-statuses">
    main: RUNNABLE | Thread-0: WAITING_ON_LOCK | Thread-1: RUNNABLE
  </span>
</div>
```

#### 5. Arrow Overlay Changes
- Add monitor_enter/exit arrows (solid red + thick)
- Different from vtable arrows (which are blue)
- Label: "monitor enter obj-123"

---

## 13. Simplified Thread DSL

### How It Works
Instead of parsing real `new Thread()` + `.start()`, use **special comments** that the interpreter recognizes:

```java
class Main {
    static void main() {
        Counter c = new Counter();
        
        // @thread "Worker-1" { run: this.increment() }
        // @thread "Worker-2" { run: this.increment() }
        
        // At this point, Thread-Worker-1 and Thread-Worker-2 are CREATED
        // User manually steps each one
    }
}
```

### Parser Recognizes
```typescript
// In interpreter.ts, during class loading or main() entry:
// Scan source for comments matching:  // @thread "Name" { run: ... }
// Extract thread ID ("Worker-1") and body expression ("this.increment()")
// Create ThreadState for each one, set to RUNNABLE
```

### Benefits
- **No Thread class needed** (avoids complex thread model)
- **Simple, clear syntax** (intent is explicit)
- **Easy to test** (just add comments)
- **Scales to N threads** (add as many `// @thread` lines as needed)

### Example: 2-Thread Race Condition
```java
class Counter {
    int count = 0;
    void increment() { synchronized(this) { count++; } }
}

class Main {
    static void main() {
        Counter c = new Counter();
        // @thread "A" { run: c.increment() }
        // @thread "B" { run: c.increment() }
        System.out.println(c.count);  // step through to see: A locks, increments, unlocks; B locks, increments
    }
}
```

---

## 14. Implementation Roadmap (Phase 2) — Updated

### Checkpoint 1: Type Contract ✅ NEXT
- Extend `types.ts`: `MarkWordState`, `MonitorState`, thread fields on `StackFrame` / `HeapObject` / `Step`
- **Time est.**: 30 min (mostly struct definitions)

### Checkpoint 2: Parser & AST
- Add `SynchronizedStmt` to ast.ts
- Add `synchronized (expr) { stmts }` parser rule
- Scan for `// @thread` comments during parsing
- **Time est.**: 1 hour

### Checkpoint 3: Interpreter — Thread Refactor
- Refactor to thread-based execution model
- Implement lock acquire/release
- Handle `SynchronizedStmt` execution
- Process `// @thread` comments
- **Time est.**: 2 hours

### Checkpoint 4: Store & Renderer
- Add thread selector to Zustand store
- Add `ThreadColors` map (fixed 4 colors)
- Render thread-colored borders on StackPanel
- Add mark word badge to HeapPanel
- Add pulse animation on lock change
- Add "WAITING_ON_LOCK" opacity effect
- **Time est.**: 2 hours

### Checkpoint 5: Testing
- Write 2-thread race condition test program
- Verify Phase 1.5 regression tests still pass
- **Time est.**: 30 min

### **Total Phase 2 Est.**: ~6 hours of focused work

---

## 15. File-by-File Checklist

| File | Changes | Priority |
|------|---------|----------|
| `packages/engine/src/types.ts` | Add `MarkWordState`, `MonitorState`, `ThreadStatus`, thread fields | 🔴 P0 |
| `packages/engine/src/languages/java/ast.ts` | Add `SynchronizedStmt` | 🔴 P0 |
| `packages/engine/src/languages/java/parser.ts` | Handle `synchronized`, scan `// @thread` | 🔴 P0 |
| `packages/engine/src/languages/java/interpreter.ts` | Thread model, lock logic, stmt execution | 🔴 P0 |
| `packages/renderer/src/store/trace.store.ts` | Add `activeThreads`, `selectedThreadId`, `threadColors`, `stepThread()` | 🟡 P1 |
| `packages/renderer/src/components/StackPanel.tsx` | Thread header + color border + blocked opacity | 🟡 P1 |
| `packages/renderer/src/components/HeapPanel.tsx` | Mark word badge + pulse animation | 🟡 P1 |
| `packages/renderer/src/App.tsx` | Thread selector + step controls | 🟡 P1 |
| `packages/engine/src/languages/java/phase2-test.ts` | Test program: 2-thread race condition + synchronized | 🟢 P2 |

---

**Ready to start Checkpoint 1?**
