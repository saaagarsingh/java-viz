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

## Phase 2 — multithreading / concurrency (COMPLETE — 2026-08-23)

Goal: visualize shared heap, per-thread stacks, and lock state — without
attempting to simulate real nondeterministic scheduling.

**Status: COMPLETE**

Completed features:
- Thread session workflow (`runThreadSession`, `stepThread`, `drainThreads`) with pending-thread controls in Custom mode.
- Java Thread API subset: `Thread()`, `Thread(String)`, `Thread(Runnable)`, `Thread(Runnable, String)`, `Thread.start()`, `Thread.join()`, `Thread.join(timeout)`, `Thread.sleep()`.
- Thread states and visualization: RUNNABLE, WAITING_ON_LOCK, WAITING_ON_THREAD, TERMINATED with deterministic scheduling and fair round-robin task rotation.
- Monitor condition operations: `Object.wait()`, `Object.wait(timeout)`, `Object.notify()`, `Object.notifyAll()` with condition-wait queue tracking.
- Synchronized methods and blocks with automatic monitor enter/exit on dispatch.
- Monitor state escalation visualization (thin-locked / fat-locked).
- Volatile field declaration + read/write visualization.
- Stack thread-name badges sourced from thread object names.
- UI improvements for large programs: collapsible Stack/Heap/Metaspace regions with summaries to manage viewport saturation.

Deliberately out of scope (deferred to future):
- Real JVM scheduler behavior and true nondeterministic execution.
- Full happens-before and memory-visibility modeling.
- Multiple GC threads.
- Spurious wakeups / interruption semantics.
- Detailed `notify` fairness policies.
- `java.util.concurrent` primitives.

**Exit criteria: SATISFIED**
- All threading examples browsable end-to-end.
- Deterministic stepping API and manual interleavings.
- Lock ownership and wait-queue visualization.
- No regression in single-thread traces.

## Phase 3 (stretch) — garbage collection

- Mark-and-sweep animation across the heap.
- Young-to-old generation promotion visualization.
- Only start this after Phase 2 is stable — lowest priority phase.

## Phase 4 – Exceptions (future)

- try / catch / finally blocks
- throw statements
- Exception propagation and stack unwinding visualization

## Phase 5 – Collections & Control Flow (future)

- Arrays and array access
- Enhanced for-each loops
- switch statements
- Labeled break/continue

## Phase 6 – Advanced OOP (future)

- Lambda expressions and invokedynamic
- Anonymous classes, nested / inner classes
- super.method() calls

## Scope discipline

This is a side project. If it starts competing with core interview
prep time (React internals, LLD, HLD, DSA, frontend system design)
ahead of the Nov 9 deadline, it loses. Weekend-only, and Phase 0 alone
is a complete enough deliverable to pause on if time gets tight.

Phase 0 (hand-traced examples) is complete and deployable.
Phase 1 (real interpreter) is complete and functional.
Phase 2 (multithreading & locking) is complete and tested.
Phases 3+ are explicitly deferred — not in current scope.