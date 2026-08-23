# JVM Visualizer — roadmap

This doc holds sequencing and scope. Persistent architecture/UI rules
live in .github/copilot-instructions.md — don't duplicate them here.

## Phase 0 — canned traces (build first, fully, before Phase 1)

Goal: a complete, presentable tool with zero parsing risk.

- Hand-author `Step[]` JSON for 6-8 example programs:
  1. Object creation and field layout (heap allocation, header, fields)
  2. Static vs instance init order (parent-before-child, static-once)
  3. Single inheritance with an overridden method (vtable dispatch,
     invokevirtual, klass-pointer follow)
  4. A static method call (invokestatic, skips heap and vtable entirely)
  5. An interface method call (itable-style lookup, contrast with vtable)
  6. Constructor + polymorphism trap (calling an overridable method from
     a constructor — demonstrates init order bugs)
  7. (stretch) Exception thrown and unwound across three stack frames
  8. (stretch) A simple two-object graph (e.g. one object referencing
     another) to test that Phase 1 layout can handle more than one box

- Build the renderer: three-column layout (Stack / Heap / Metaspace),
  step forward/back controls, current line highlighted in a read-only
  code panel, arrows animating between regions on each step transition.
- No code parsing yet. Programs are pre-written, traces are pre-authored.
- Deliverable: a working, deployable app with all examples browsable
  end to end, matching the UI spec in copilot-instructions.md.

**Exit criteria before starting Phase 1:** all 6 core examples browsable,
no overlapping elements at 768px+, arrows computed from DOM positions
(not hardcoded), legend always visible, keyboard-navigable stepper.

## Phase 1 — real interpreter for a constrained subset

Goal: paste real Java-like source, get an automatically generated trace.

Supported subset (Phase 1 + 1.5):
- Classes, fields, constructors (including overloaded constructors — resolved by arity)
- Instance and static methods (including overloaded methods — resolved by arity)
- `static` and instance fields, static init blocks
- Single inheritance, method overriding
- Interfaces (default and abstract methods)
- `if`, `for`, `while`, arithmetic, `new`, method calls, `println`
- `break` and `continue` in `for`/`while` loops
- Ternary `condition ? thenExpr : elseExpr`
- `instanceof` type checks (emits klass_pointer_follow step)
- Pre/post `++` / `--` (both as standalone statements and in initializers/RHS)
- Compound assignment: `+=`, `-=`, `*=`, `/=`, `%=`

Explicitly OUT of scope for Phase 1+1.5:
- Generics (type erasure has nothing to execute)
- Lambdas / invokedynamic (Phase 6)
- Exceptions / try-catch-finally / throw (Phase 4)
- Records, enums, sealed classes
- Arrays and enhanced-for (Phase 5)
- `switch` statements
- `synchronized` blocks / volatile fields (Phase 2)
- Native methods, annotations
- Package/import declarations (only `java.lang` is implicit)
- Nested / inner classes
- `this()` constructor chaining
- Varargs, multi-dimensional arrays
- Labeled statements (labeled break/continue)

Implementation notes:
- Use the `java-parser` npm package (Chevrotain-based) for the AST.
  Do not hand-write a parser.
- `engine/interpreter.ts` walks the AST and emits `Step[]` live,
  matching: class loading order, static block timing, constructor
  chaining, field defaults before initializers, vtable dispatch,
  itable-style interface dispatch.
- Before adding any new parser/interpreter feature work, pass the
  conformance gate in:
  - `docs/parser-ast-contract.md`
  - `docs/parser-ast-conformance.md`
- Cap live object graphs at 3-4 objects on screen for this phase —
  general-purpose graph layout (arbitrary linked lists/trees) is
  explicitly deferred, not solved here.
- Unsupported syntax fails loudly with a specific "not supported in
  this teaching subset" message — never silently produces a wrong trace.

**Exit criteria:** all Phase 0 example programs also work when typed in
as real source and produce identical traces to the hand-authored ones
(this is your regression test that the interpreter matches the hand
trace).

## Phase 2 — multithreading / concurrency

Goal: visualize shared heap, per-thread stacks, and lock state — without
attempting to simulate real nondeterministic scheduling.

Current status (2026-08-23):
- Implemented: thread session workflow (`runThreadSession`, `stepThread`, `drainThreads`) with pending-thread controls in Custom mode.
- Implemented: Java Thread API subset for teaching flows: `Thread.start()`, `Thread.join()`, `Thread.join(timeout)`, `Thread.sleep()`, and constructors `Thread()`, `Thread(String)`, `Thread(Runnable)`, `Thread(Runnable, String)`.
- Implemented: `WAITING_ON_THREAD` state and timeout wake-up steps (`thread_join_timeout`, `thread_wakeup`).
- Implemented (Phase 2.1): monitor condition operations `Object.wait()`, `Object.wait(timeout)`, `Object.notify()`, `Object.notifyAll()` in deterministic stepping mode.
- Implemented (Phase 2.1): monitor state escalation visualization (`thin-locked` / `fat-locked`) and condition-wait queue tracking.
- Implemented: stack thread-name badges sourced from thread object names.
- Implemented: run behavior now starts from the first step in the trace on fresh execution.

Still out of scope:
- Real JVM scheduler behavior and true nondeterministic execution.
- Full happens-before and memory-visibility modeling.
- Multiple GC threads.

## Phase 3 (stretch) — garbage collection

- Mark-and-sweep animation across the heap.
- Young-to-old generation promotion visualization.
- Only start this after Phase 2 is stable — lowest priority phase.

## Scope discipline

This is a side project. If it starts competing with core interview
prep time (React internals, LLD, HLD, DSA, frontend system design)
ahead of the Nov 9 deadline, it loses. Weekend-only, and Phase 0 alone
is a complete enough deliverable to pause on if time gets tight.

## Future scope (after current roadmap)

Concurrency topics intentionally deferred:
- Spurious wakeups / interruption semantics around `wait()`.
- Detailed `notify` fairness policies and scheduler-level nondeterminism.
- `java.util.concurrent` primitives (`ReentrantLock`, `ReadWriteLock`, semaphores, atomics).
- Full Java Memory Model visibility and ordering guarantees.