# Parser to AST Contract (Java Subset)

Status: Draft v1
Owner: engine package
Scope: packages/engine/src/languages/java/parser.ts -> ast.ts

## Purpose

Define a stable, explicit contract for what the Java parser produces and how
the engine consumes it, so renderer and future phases can evolve without
semantic drift.

This document is the source of truth for:
- parse coverage and unsupported behavior
- AST normalization rules
- error guarantees
- invariants required by interpreter and tests

## Contract boundaries

1. Input boundary
- Input: Java-like source string from UI worker request.
- Parser backend: java-parser CST.

2. Output boundary
- Output: simplified Program AST defined in ast.ts.
- Interpreter reads only this AST. It does not consume CST directly.

3. Downstream boundary
- Interpreter emits Step[] contract (types.ts).
- Renderer consumes Step[] only.

## Canonical terminology

- CST: concrete syntax tree from java-parser.
- AST: normalized semantic tree used by interpreter.
- Unsupported feature: syntax intentionally out of phase scope and must fail
  loudly.
- Normalization: deterministic transform from multiple syntactic forms into one
  AST representation.
- Invariant: a rule that must always hold for any AST node of a given kind.

## AST shape and invariants

Top-level nodes
- Program
  - kind must be Program.
  - classes contains all type declarations in source order.
- ClassDecl
  - name is non-empty.
  - superclass is null or a class name.
  - interfaces is empty or list of names.
  - loc.line is set (>= 0).

Members
- FieldDecl
  - initializer is Expr or null.
  - isStatic is explicit boolean.
- ConstructorDecl
  - name matches owning class name.
  - body is ordered Statement list.
- MethodDecl
  - body is null only for abstract/interface declaration without body.
  - isStatic and isAbstract are explicit booleans.

Statements and expressions
- Every Statement and Expr must include loc.
- Assignment targets are constrained to VarExpr, FieldAccessExpr,
  StaticFieldAccessExpr.
- Method call forms are split:
  - MethodCallExpr for receiver-based or implicit this calls.
  - StaticMethodCallExpr for ClassName.method() calls.
  - PrintlnExpr for System.out.println only.

## Normalization rules (must be deterministic)

1. Implicit receiver calls
- method(args) normalizes to MethodCallExpr(receiver=ThisExpr).

2. Field and static access
- obj.field -> FieldAccessExpr.
- ClassName.field -> StaticFieldAccessExpr.

3. Method calls
- obj.m(args) -> MethodCallExpr.
- ClassName.m(args) -> StaticMethodCallExpr.

4. Constructor invocation in constructors
- super(args) normalizes to ExprStmt(SuperCallExpr).

5. Literals
- Numeric literal kind chosen by suffix/type.
- String and char preserve lexical value after escape normalization.

6. Binary expressions
- Left-associative folding for chained operators in same CST sequence.

7. Println special-case
- Only System.out.println is transformed to PrintlnExpr.

## Unsupported behavior policy

Required behavior
- Unsupported syntax must return an explicit UnsupportedError/ParseError with
  feature name and line when available.
- Parser must not silently drop unsupported constructs.

Disallowed behavior
- Silent skipping of parameters, arguments, statements, or member declarations.
- Heuristic reinterpretation without explicit rule in this document.

Explicit exception (Phase 1 compatibility)
- `static void main(String[] args)` is accepted even though array params are not
  modeled in `JavaType` yet.
- The `args` parameter is intentionally dropped during AST transform.
- This exception must not be generalized to other array params.

## Error contract

Parser phase errors
- parse_error
  - Use when syntax cannot be parsed or transformed.
  - Include message and line (or null if unavailable).
- unsupported_syntax
  - Use when syntax is valid Java but outside teaching subset.
  - Include feature and line.

Runtime phase errors (interpreter)
- Must remain distinct from parser errors.
- Must not be used to hide parse-time unsupported features.

## Source location contract

- All AST nodes must include SourceLoc.
- line is 1-indexed and maps to source shown in CodePanel.
- sourceLineNumber in Step should correspond to active semantic action.

## Current known deviations from this contract

These are accepted temporarily and tracked for fix before expanding scope:
- Some formal parameter forms are currently skipped instead of rejected.
- Interface table population is incomplete for full invokeinterface semantics.
- Some resolution paths use naming heuristics that should become symbol-aware.

## Versioning

- Contract version: parser-ast-v1.
- Any AST shape change requires:
  1. contract doc update,
  2. conformance checklist update,
  3. tests updated in same PR.

## Review checklist for parser PRs

- Does this change alter AST shape?
- Does it alter normalization rules?
- Are unsupported constructs still fail-loud with line info?
- Are line mappings still stable?
- Are new nodes consumed by interpreter with no CST leak?