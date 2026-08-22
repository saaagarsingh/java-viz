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

Supported subset:
- Classes, fields, constructors
- Instance and static methods
- `static` and instance fields, static init blocks
- Single inheritance, method overriding
- Interfaces (default and abstract methods)
- `if`, `for`, arithmetic, `new`, method calls, `println`

Explicitly OUT of scope for Phase 1 (compile-time-only concepts —
these become static explanatory diagrams later, not live traces):
- Generics (type erasure has nothing to execute)
- Lambdas / invokedynamic
- Exceptions / try-with-resources
- Records, enums (revisit only if time allows after core subset is solid)

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

- Multiple stacks (one column per thread) sharing one heap.
- Manual stepping per thread ("step thread A" / "step thread B")
  instead of an automatic scheduler — the user deliberately constructs
  interleavings and race conditions themselves.
- Visualize the object header's mark word changing state
  (unlocked -> thin-locked -> fat-locked) when a thread enters a
  `synchronized` block on a shared object.
- Do not attempt: real scheduler simulation, memory visibility/happens-
  before modeling, or multiple GC threads. Out of scope for this tool.

## Phase 3 (stretch) — garbage collection

- Mark-and-sweep animation across the heap.
- Young-to-old generation promotion visualization.
- Only start this after Phase 2 is stable — lowest priority phase.

## Scope discipline

This is a side project. If it starts competing with core interview
prep time (React internals, LLD, HLD, DSA, frontend system design)
ahead of the Nov 9 deadline, it loses. Weekend-only, and Phase 0 alone
is a complete enough deliverable to pause on if time gets tight.