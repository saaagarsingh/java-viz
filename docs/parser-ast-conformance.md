# Parser and AST Conformance Gate

Status: Draft v1
Applies before any new language feature phase work.

## Goal

Prevent semantic regressions by requiring parser -> AST -> Step validation
before new features are added.

## Gate inputs

- Contract doc: docs/parser-ast-contract.md
- Engine source:
  - parser.ts
  - ast.ts
  - class-loader.ts
  - interpreter.ts
- Program fixtures:
  - traces sourceCode examples
  - test-programs complex source

## Pass criteria

All sections below must pass.

### A) Structural AST checks

1. Every emitted Statement/Expr has loc.line.
2. ConstructorDecl.name matches owning class.
3. Assignment targets always use allowed union members.
4. Method call variants map only to MethodCallExpr, StaticMethodCallExpr,
   PrintlnExpr (for System.out.println).

### B) Unsupported syntax behavior

1. Out-of-scope features fail with unsupported_syntax.
2. No silent skipping of parse nodes.
3. Error includes line when token location exists.
4. Only one parser exception is allowed: `static void main(String[] args)` may
  be accepted and normalized by dropping `args` until array types are modeled.

### C) Runtime semantic checks

1. Step 0 exists and represents loaded state before main execution.
2. Static init events are visible via clinit or putstatic deltas.
3. Virtual dispatch emits klass_pointer_follow and vtable_lookup before
   invokevirtual dispatch step.
4. Interface dispatch emits itable_lookup and invokeinterface when
   interface receiver is used.
5. return deltas are produced for method/constructor exits.

### D) Source line mapping

1. Step.sourceLineNumber remains 1-indexed.
2. Important deltas map to expected source lines for fixtures.

### E) Determinism

1. Same source produces equivalent AST JSON (ignoring object identity).
2. Same source produces equivalent operation sequence in Step deltas.

## Suggested fixture matrix

Core examples
- 01 object creation
- 02 static vs instance init
- 03 vtable dispatch
- 04 invokestatic
- 05 invokeinterface
- 06 constructor polymorphism trap

Complex source
- test-programs COMPLEX_TEST_SOURCE

Negative fixtures (must fail loudly)
- arrays in params or types
- try/catch/finally
- synchronized blocks/methods
- lambda expressions
- switch

## Conformance report template

Use this template in PR description:

- Contract version: parser-ast-v1
- Parser changes:
- AST shape changes:
- A) Structural AST checks: pass/fail
- B) Unsupported syntax behavior: pass/fail
- C) Runtime semantic checks: pass/fail
- D) Source line mapping: pass/fail
- E) Determinism: pass/fail
- Known deviations remaining:
- Follow-up issues created:

## Immediate backlog from current analysis

1. Remove silent parameter skipping and replace with explicit unsupported_syntax.
2. Implement default constructor behavior for classes without declared ctors.
3. Complete interface method resolution path so invokeinterface is observable.
4. Replace naming heuristics with symbol-aware static/instance resolution.
5. Move method lookup to descriptor-aware matching to future-proof overloading.