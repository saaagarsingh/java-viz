# JVM Visualizer — Project Memory

> Kael's working memory. Update this at the end of every session.
> Read this FIRST at the start of every session before touching any file.

---

## What this project is

Interactive step-by-step JVM memory visualizer ("Python Tutor for the JVM").
Audience: engineers studying JVM internals for senior interviews.
Stack: npm workspaces, Vite + React 18 + TypeScript strict, Zustand.

---

## Current state (as of 2026-08-22 session 3 end)

### ✅ Phase 0 — Hand-authored traces + full UI (DONE)
- 6 example programs with correct `sourceLineNumber` alignment.
- 3-column resizable layout, code panel, arrows, keyboard nav, legend.
- All examples work in the browser.

### ✅ Engine — Parser, class-loader, interpreter scaffold (TYPED CLEAN, NOT RUNTIME TESTED)
- `parser.ts` completely rewritten against empirical CST audit this session. **Parses correctly** (verified with node runtime test on Shape/Circle/Rectangle/MathUtils program).
- `class-loader.ts` builds KlassInfo[], vtable, itable, static field defaults.
- `interpreter.ts` tree-walking executor — TypeScript clean, **NOT YET RUNTIME TESTED** end-to-end.
- **Next session priority: run regression tests before any new feature work.**

### ✅ Renderer — All UI polish done this session
- Collapsible Heap + Metaspace cards (auto-expand active, collapse inactive)
- ArrowOverlay: scroll capture listener added (arrows recompute on any panel scroll)
- SupportMatrix sidebar: `✓ supported` button (green pill), slides from right, Escape close
- ErrorCard: semantic error display (amber `⊘` for unsupported, red for parse/runtime)
- ErrorToast: distinct amber variant for unsupported features
- Custom mode: flips to CodePanel with `► line N` indicator after run; `◀ edit` returns to textarea
- `setMode('custom')` now clears example trace (no more "Point" bleeding into custom tab)
- `setCustomSource()` clears stale trace (editing = back to editor)
- `flex-shrink: 0` on all cards (fixed content clipping in scroll panels)

---

## Known hidden implementation issues (found in code audit)

### 1. `getInterfaceMethods()` returns empty — itable is BROKEN
**File**: `class-loader.ts`, function `getInterfaceMethods()`
```typescript
function getInterfaceMethods(...) {
  // Interface vtable is empty — we have to rely on the program ClassDecl.
  // For now return empty; the interpreter fills itable lazily.
  return [];  // ← THIS IS THE BUG
}
```
**Effect**: All `ITableEntry.slots` are empty arrays. `invokeinterface` falls back to vtable lookup (`invokeVirtual`). This means invokeinterface WORKS but doesn't show the itable step — it silently degrades to vtable dispatch.
**Fix needed**: Pass `LoadedClasses.decls` into `buildITable()` and read the interface's method declarations from the ClassDecl (not the KlassInfo, since interfaces have no vtable).

### 2. `buildStaticFieldDefaults` sets `declaredIn: 'Unknown'`
**File**: `class-loader.ts`, function `buildStaticFieldDefaults()`
```typescript
return fields.map(f => ({
  name:       f.name,
  declaredIn: (f as any).__className ?? 'Unknown',  // ← __className is never set
  value:      defaultValue(f.type),
}));
```
**Effect**: Static fields show `declaredIn: 'Unknown'` in Metaspace panel. Functionally harmless (interpreter uses className from context), cosmetically wrong.
**Fix needed**: Pass className into `buildStaticFieldDefaults()` and use it directly.

### 3. `StringLiteral` mapped to `kind: 'char'` in interpreter
**File**: `interpreter.ts`, `evalExpr` switch
```typescript
case 'StringLiteral': return { kind: 'char', value: expr.value }; // modeled as char value
```
**Effect**: Strings work (println displays them) but the `Value` kind is `'char'` not a proper `'string'`. String concatenation works because `evalBinaryPrimitive` checks for `char` kind. Minor inaccuracy in the snapshot — shows type as `char` in locals.

### 4. `invokeVirtual` pushes a frame AND executes — effectively double-steps
**File**: `interpreter.ts`
When `invokeVirtual` is called, it: (1) emits a `klass_pointer_follow` step, (2) emits a `vtable_lookup` step, (3) calls `pushFrame`, (4) emits an `invokevirtual` step, (5) executes method body. This means a simple `c.area()` produces 3+ steps before any body code runs. This is pedagogically correct but worth knowing.

### 5. `ensureInitialized` triggers `<clinit>` on ANY static access, including reads
This means the first `AbstractShape.count` read triggers `<clinit>` even if no initializer runs. The step still emits a `clinit` description even for classes with no static initializers. Minor noise in trace.

### 6. `resolveVar` tries `this.field` as fallback for unqualified names
**File**: `interpreter.ts`, `resolveVar()`
When `name` is not found as a local, it tries to read `this.field`. This handles the common pattern `return area * 2` where `area` is not a local but `this.area()` is a method. But it only looks up fields, not methods. `area()` as an unqualified call goes through `MethodCallExpr` (parser converts it to `this.area()`), so this is correct. But if someone writes `return width + height` inside `Rectangle.area()`, `width` and `height` are resolved as `this.width` and `this.height` via the field fallback — which works. ✓

### 7. `findConstructor` uses arity only, ignores param types
```typescript
return decl.constructors.find(c => c.params.length === arity) ?? decl.constructors[0];
```
Constructor overloading by type is not supported. For our subset this is fine.

---

## Parser CST facts (java-parser v3 — empirically verified, DO NOT GUESS)

```
ALL expressions: expression → conditionalExpression → binaryExpression

binaryExpression:
  AssignmentOperator key → =, +=, -=, *=, /=, %=  (RHS in 'expression' child)
  BinaryOperator key     → +, -, *, /, %, ==, !=, <, >, <=, >=, &&, ||
  single unaryExpression → passthrough

unaryExpression:
  Not key              → !x
  Minus key            → -x
  UnarySuffixOperator  → x++, x--
  PlusPlus/MinusMinus  → ++x, --x
  primary key          → passthrough

primary = primaryPrefix + primarySuffix[]
  primaryPrefix:
    This token         → this
    literal rule       → numbers/strings/booleans
    newExpression      → new Foo(args)
    fqnOrRefType       → identifier chain (obj, Cls.field, System.out.println)

  primarySuffix (0..N):
    Dot + Identifier               → field access or pending method name
    methodInvocationSuffix (args)  → method call

  Patterns:
    this.field         → prefix=This,  suffix=[Dot+field]
    this.method(args)  → prefix=This,  suffix=[Dot+method, methodInvocationSuffix]
    obj.field          → prefix=fqn(obj,field),  NO suffix
    obj.method(args)   → prefix=fqn(obj,method), suffix=[methodInvocationSuffix]
    area()             → prefix=fqn(area),        suffix=[methodInvocationSuffix]
    Cls.staticMethod() → prefix=fqn(Cls,method),  suffix=[methodInvocationSuffix]

statementExpression → expression (ONE child only)

Class declaration:
  normalClassDeclaration → typeIdentifier → Identifier  (class name)
  classExtends → classType → Identifier                  (superclass)
  classImplements → interfaceTypeList → interfaceType → classType → Identifier

Formal params:
  formalParameter → variableParaRegularParameter → unannType + variableDeclaratorId
  Array params (String[] args): hasArrayDims() → silently skip

Constructor body:
  constructorBody → explicitConstructorInvocation (direct child, BEFORE blockStatements)
                 → unqualifiedExplicitConstructorInvocation → Super + argList + ;
                 → blockStatements → blockStatement[]

Statement rules:
  ifStatement (covers both if and if-else — NOT ifThenStatement)
  whileStatement, forStatement (correct)
```

---

## Repo layout

```
packages/
  engine/
    src/
      types.ts                        ← Step contract (ONLY shared interface)
      traces/
        index.ts                      ← 6 TraceEntry[] with sourceCode
        01-object-creation.ts         ← Hand-authored (correct line numbers)
        02-static-vs-instance-init.ts
        03-vtable-dispatch.ts
        04-invokestatic.ts
        05-invokeinterface.ts
        06-constructor-polymorphism-trap.ts
      languages/java/
        ast.ts                        ← Simplified AST (never touch Chevrotain CST)
        parser.ts                     ← java-parser CST → our AST (fully rewritten)
        class-loader.ts               ← KlassInfo + vtable/itable builder
        interpreter.ts                ← Tree-walk executor → Step[]
        limits.ts                     ← MAX_STEPS=500, HEAP=50, DEPTH=20, LOOP=200
        index.ts                      ← runJava(source) → TraceResult
  renderer/
    src/
      App.tsx                         ← Main shell
      store/trace.store.ts            ← Zustand (localStorage: customSource, mode, exampleIdx)
      components/
        StackPanel.tsx
        HeapPanel.tsx                 ← Collapsible cards, auto-expand active
        MetaspacePanel.tsx            ← Collapsible cards, auto-expand active
        ArrowOverlay.tsx              ← getBoundingClientRect + scroll listener
        CodePanel.tsx                 ← Syntax highlight + amber active line
        CustomEditor.tsx              ← Textarea → flips to CodePanel after run
        ErrorToast.tsx                ← Amber variant for unsupported features
        ErrorCard.tsx                 ← Semantic error display (⊘/✕/⚡)
        SupportMatrix.tsx             ← Slide-in sidebar with ✓/✗ feature lists
        ResizeHandle.tsx
      hooks/
        useInterpreter.ts             ← Web Worker lifecycle
      workers/
        interpreter.worker.ts
      styles/
        tokens.css                    ← Region + operation color tokens
        app.css
    vite.config.ts                    ← MUST use alias array form, most-specific first
```

---

## Design decisions locked

**Color system** (closed — never deviate):
| Region | Hex |
|---|---|
| Stack | `#6366F1` (Indigo) |
| Heap | `#F59E0B` (Amber) |
| Metaspace | `#14B8A6` (Teal) |
Operation colors: slate family (`#94A3B8`, `#CBD5E1`, `#64748B`). Writes: `#D97706`.

**Step contract**: Every Step is a complete immutable snapshot. Renderer is stateless per step. `delta` is null only for step 0.

**Vite alias** (CRITICAL — array form, most-specific first):
```
@jvm-viz/engine/languages/java/limits → ...limits.ts
@jvm-viz/engine/languages/java        → ...java/index.ts
@jvm-viz/engine                       → ...engine/src/index.ts
```

---

## Dev commands

```bash
cd packages/renderer && ../../node_modules/.bin/vite --port 5173  # dev server
node_modules/.bin/tsc --noEmit -p packages/engine/tsconfig.json   # type-check engine
node_modules/.bin/tsc --noEmit -p packages/renderer/tsconfig.json # type-check renderer
# Node: 24.14.0 via asdf
```

---

## Phase roadmap

| Phase | Status | Description |
|---|---|---|
| 0 | ✅ Done | Hand-authored traces, full UI |
| 1 | 🔨 **Next** | Runtime-test interpreter, fix itable bug, run regression |
| 1.5 | Not started | Ternary, break/continue, instanceof, type cast, for-each |
| 2 | Not started | Concurrency: synchronized, volatile, Thread |
| 3 | Not started | GC: mark-and-sweep, generational |
| 4 | Not started | Exceptions: throw, try/catch/finally |
| 5 | Not started | Arrays, enum, record, autoboxing |
| 6 | Not started | Lambda/invokedynamic |

**Phase 1 exit criteria**: all 6 Phase 0 source programs typed into Custom tab produce semantically identical output to the hand-authored traces.

---

## Next session — exact order of work

### Step 1: Fix the two structural bugs BEFORE testing (10 min)

**Bug A — `getInterfaceMethods` returns empty** (`class-loader.ts`):
```typescript
// CURRENT (broken):
function getInterfaceMethods(ifaceName, loaded) { return []; }

// FIX: needs LoadedClasses.decls passed in, read ClassDecl.methods for interface
function getInterfaceMethods(ifaceName: string, decls: Map<string, ClassDecl>): [string, string][] {
  const ifaceDecl = decls.get(ifaceName);
  if (!ifaceDecl || !ifaceDecl.isInterface) return [];
  return ifaceDecl.methods.map(m => [m.name, buildDescriptor(m)]);
}
```
Pass `loaded.decls` (or the `decls` Map) into `buildITable()`.

**Bug B — `declaredIn: 'Unknown'`** (`class-loader.ts`):
```typescript
// CURRENT (broken):
declaredIn: (f as any).__className ?? 'Unknown',
// FIX: add className param to buildStaticFieldDefaults():
function buildStaticFieldDefaults(fields: FieldDecl[], className: string): FieldSlot[] {
  return fields.map(f => ({ name: f.name, declaredIn: className, value: defaultValue(f.type) }));
}
// Call site in buildKlass(): buildStaticFieldDefaults(fields, decl.name)
```

### Step 2: Runtime regression tests

Run these 6 programs through `runJava()` (node runtime test, not browser):
1. Point — basic object creation
2. Counter — static + instance fields
3. Animal/Dog — virtual dispatch
4. MathUtils.add — invokestatic
5. Drawable/Square — invokeinterface (tests itable fix)
6. Base/Derived — inheritance chain + super()

Expected: all 6 parse + execute without errors, stdout matches expected values.

### Step 3: Run the complex Shape program in browser

```java
interface Shape { int area(); }
class AbstractShape implements Shape {
  static int count = 0; String name;
  AbstractShape(String name) { this.name = name; count = count + 1; }
  int doubled() { return area() * 2; }
}
class Circle extends AbstractShape {
  int radius;
  Circle(int radius) { super("Circle"); this.radius = radius; }
  public int area() { return 3 * radius * radius; }
}
class Rectangle extends AbstractShape {
  int width; int height;
  Rectangle(int w, int h) { super("Rectangle"); this.width = w; this.height = h; }
  public int area() { return width * height; }
}
class MathUtils { static int max(int a, int b) { if (a > b) { return a; } return b; } }
class Main {
  public static void main(String[] args) {
    Circle c = new Circle(5);
    Rectangle r = new Rectangle(4, 6);
    System.out.println("Circle area=" + c.area());
    System.out.println("Rectangle area=" + r.area());
    int total = c.area() + r.area();
    System.out.println("Total area=" + total);
    int larger = MathUtils.max(c.area(), r.area());
    System.out.println("Larger area=" + larger);
    System.out.println("count=" + AbstractShape.count);
  }
}
```
Expected stdout: `Circle area=75`, `Rectangle area=24`, `Total area=99`, `Larger area=75`, `count=2`

(Note: `3 * 5 * 5 = 75`, not 78 — 78 would require π≈3.14)

### Step 4: Fix whatever runtime errors are found

Most likely failure points in order of probability:
1. `invokeinterface` itable path (itable fix in Step 1 should handle this)
2. `super()` in constructor — `evalSuperCall` reads `currentClass` from frame but the frame is the SUBCLASS frame, so it correctly goes to the super. Should work.
3. Static field access `AbstractShape.count` — goes through `StaticFieldAccessExpr` → `getStaticField` → works if `setStaticField` was called. Possible issue: `ensureInitialized` runs on first static access but `count` is initialized in field initializer, not `<clinit>` block — should still work since `ensureInitialized` processes field initializers.
4. String concatenation `"Circle area=" + c.area()` — `c.area()` returns `{kind:'int', value:75}`, then `+` with a `{kind:'char', value:'Circle area='}` should hit the string concatenation path in `evalBinaryPrimitive`. ✓
5. Unqualified field access `width * height` in `Rectangle.area()` — `width` and `height` are not locals, so `resolveVar` falls through to `this.field` lookup. The field key is `Rectangle.width`. Should work. ✓

---

## Interpreter accuracy contract

We model the JVM from end-of-Preparation/Resolution onward:
- Step 0 = classes loaded, static defaults set (`isInitialized = false`)
- `<clinit>` steps = initialization (field initializers + static blocks)
- Execution steps = method bodies

What we DO NOT model (before our entry point):
- `javac` compilation — we parse source directly
- `.class` file / bytecode / constant pool
- Bytecode verification
- JIT compilation
- `java.lang.*` (String is a value, Object stubs only)
- GC / object headers / mark word / memory addresses
- Multi-threading


---

## What this project is

Interactive step-by-step JVM memory visualizer ("Python Tutor for the JVM").
Audience: engineers studying JVM internals for senior interviews.
Stack: npm workspaces, Vite + React 18 + TypeScript strict, Zustand.

---

## Current state (as of 2026-08-22 session end)

### What works
- **Phase 0** (hand-authored traces): 6 example programs fully browsable in the UI.
  Examples tab loads them immediately; step forward/back with ← → keys.
- **3-column resizable layout** (Stack / Heap / Metaspace) + resizable code panel.
  All 4 resize handles persist layout to `localStorage` under key `jvm-viz-layout`.
- **Custom tab**: textarea editor, ▶ Run button (⌘↵), runs interpreter in a Web Worker.
- **Zustand store** (`packages/renderer/src/store/trace.store.ts`):
  - `customSource` + `lang` + `mode` + `exampleIdx` persisted to localStorage (`jvm-viz-trace`).
  - Execution state (`steps`, `error`, `status`, `stepIndex`) in-memory only.
- **Error toast** (auto-dismiss 6s) + red shaker on step-info panel on error.
- **Full app shell always renders** — no blank screen on error, always recoverable.
- **Phase 1 interpreter scaffold**: parser (CST→AST), class-loader, tree-walk interpreter, Web Worker.
  TypeScript types clean on both packages.

### What is broken / not yet tested end-to-end
- The interpreter has NOT been run against real programs yet as of session end.
  Screenshot confirms the hand-authored Point trace works.
- Complex test program (Shape/Circle/Rectangle hierarchy) now **parses correctly** (2026-08-22 session 2).

## Parser CST facts (java-parser v3 — DO NOT GUESS, verified empirically)

The java-parser CST structure for expressions — ENTIRELY different from what we first assumed:

1. ALL expressions go: `expression → conditionalExpression → binaryExpression`
2. `binaryExpression` uses:
   - key `AssignmentOperator` for `=`, `+=`, `-=`, etc. (child is the `=` token)
   - key `BinaryOperator` for `+`, `-`, `>`, `==`, etc.
   - key `unaryExpression[]` for operands (1=passthrough, 2+=binary op)
3. `unaryExpression` uses:
   - key `Not` for `!x`, key `Minus` for `-x`, key `Plus` for `+x`
   - key `UnarySuffixOperator` for `x++`, `x--`
   - key `primary` for plain primary
4. `primary` = `primaryPrefix` + `primarySuffix[]`
5. `primaryPrefix` has: `This` | `literal` | `newExpression` | `fqnOrRefType`
6. `fqnOrRefType` = chain of identifiers (first + rest parts)
7. `primarySuffix` has: `Dot+Identifier` OR `methodInvocationSuffix`
   - `this.method(args)` → prefix=This, suffix[0]=Dot+method, suffix[1]=methodInvocationSuffix
   - `obj.method(args)` → prefix=fqnOrRefType(obj,method), suffix[0]=methodInvocationSuffix
   - `this.field` → prefix=This, suffix[0]=Dot+field (no methodInvocationSuffix)
   - `obj.field` → prefix=fqnOrRefType(obj, field) (NO suffix at all)
8. `statementExpression` has exactly ONE child: `expression` (not `assignment`/`methodInvocation`)
9. Class name: `normalClassDeclaration → typeIdentifier → Identifier`
10. Formal params: `formalParameter → variableParaRegularParameter → unannType + variableDeclaratorId`
11. Constructor super(): `constructorBody → explicitConstructorInvocation → unqualifiedExplicitConstructorInvocation`
    (direct child of constructorBody, NOT inside blockStatements)
12. if/while/for rule names: `ifStatement` (covers both if and if-else), `whileStatement`, `forStatement`

---

## Repo layout

```
packages/
  engine/
    src/
      types.ts                   ← Step contract (the only shared interface)
      traces/
        01-object-creation.ts    ← Hand-authored (correct line numbers)
        02-static-vs-instance-init.ts
        03-vtable-dispatch.ts
        04-invokestatic.ts
        05-invokeinterface.ts
        06-constructor-polymorphism-trap.ts
        index.ts                 ← TraceEntry[] with sourceCode strings
      languages/java/
        ast.ts                   ← Simplified AST (not Chevrotain CST)
        parser.ts                ← java-parser CST → our AST
        class-loader.ts          ← KlassInfo + vtable/itable builder
        interpreter.ts           ← Tree-walk executor → Step[]
        limits.ts                ← MAX_STEPS=500, HEAP=50, DEPTH=20, LOOP=200
        index.ts                 ← runJava(source) → TraceResult
        test-programs.ts         ← Complex test program source strings
  renderer/
    src/
      App.tsx                    ← Main shell (Zustand wired, resizable, example+custom)
      store/trace.store.ts       ← Zustand store
      components/
        StackPanel.tsx
        HeapPanel.tsx
        MetaspacePanel.tsx
        ArrowOverlay.tsx         ← DOM-computed arrows (getBoundingClientRect)
        CodePanel.tsx            ← Syntax-highlighted code + line pointer
        ResizeHandle.tsx         ← Drag-to-resize handle
        CustomEditor.tsx         ← Textarea editor with run button
        ErrorToast.tsx           ← Auto-dismiss error notification
      hooks/
        useDragHandle.ts
        useInterpreter.ts        ← Web Worker lifecycle hook
      workers/
        interpreter.worker.ts   ← Worker: calls runJava, posts TraceResult
      styles/
        tokens.css               ← Design tokens (region colors, op colors)
        app.css                  ← All component styles
    vite.config.ts               ← Alias array (most-specific first — critical!)
    tsconfig.json
```

---

## Design decisions locked

### Color system (closed — never change without re-auditing)
| Region | Color | Hex |
|---|---|---|
| Stack | Indigo | `#6366F1` |
| Heap | Amber | `#F59E0B` |
| Metaspace | Teal | `#14B8A6` |

Operation colors are slate-family (`#94A3B8`, `#CBD5E1`, `#64748B`) so they never
visually collide with region colors. Writes use `#D97706` amber tint.

### Step contract (`types.ts`)
- `Step.sourceLineNumber` is 1-indexed, matches `TraceEntry.sourceCode` lines exactly.
- `Step.arrows[]` = ALL arrows visible on this step (renderer is stateless per step).
- `delta` is null only for step 0; engine owns highlight/arrow metadata.

### Interpreter design
- Tree-walk over our simplified AST (never the raw Chevrotain CST).
- Steps emitted at: `new_object`, method entry/return, `putfield`/`putstatic`, `clinit`,
  vtable/itable lookup, `println`. NOT for arithmetic or control flow.
- All safety limits produce typed `InterpreterError`, never unhandled throws.
- Runs in a Web Worker; main thread never blocks.

### Vite alias order (critical!)
Must use array form, most-specific first:
```
@jvm-viz/engine/languages/java/limits  →  engine/src/languages/java/limits.ts
@jvm-viz/engine/languages/java         →  engine/src/languages/java/index.ts
@jvm-viz/engine                        →  engine/src/index.ts
```
Object form causes prefix collision (`@jvm-viz/engine` matches subpaths).

---

## Dev commands

```bash
# Start dev server (from repo root)
cd packages/renderer && ../../node_modules/.bin/vite --port 5173

# Or from root:
npm run dev

# Type-check both packages
node_modules/.bin/tsc --noEmit -p packages/engine/tsconfig.json
node_modules/.bin/tsc --noEmit -p packages/renderer/tsconfig.json

# Node version: 24.14.0 (set via asdf, .tool-versions file present)
```

---

## Phase roadmap (abridged)

| Phase | Status | Description |
|---|---|---|
| 0 | ✅ Done | Hand-authored traces, full UI, resizable layout |
| 1 | 🔨 In progress | Real interpreter — needs runtime testing + fixes |
| 1.5 | Not started | ++/--, ternary, instanceof, break/continue, overloading |
| 2 | Not started | Concurrency: synchronized, volatile, Thread, mark word |
| 3 | Not started | GC: mark-and-sweep, generational |
| 4 | Not started | Exceptions: throw, try/catch/finally |
| 5 | Not started | Arrays, enum, record, autoboxing |
| 6 | Not started | Lambda/invokedynamic (THE teaching moment: no heap obj at creation) |
| 7 | Not started | Multi-language: Python, Kotlin |

**Phase 1 exit criteria**: all 6 Phase 0 source programs, when typed into the Custom tab
and run, produce semantically identical output to the hand-authored traces.

---

## Known issues / next tasks

1. **Run the complex test program** (Shape/Circle/Rectangle) in the Custom tab.
   Expected stdout: `Circle area=78`, `Rectangle area=24`, `Total area=102`, `Larger area=78`, `count=2`.
   Fix any parser/interpreter bugs found.

2. **Phase 1 regression test**: paste each of the 6 hand-authored source programs into Custom
   and verify the interpreter output matches the hand trace exactly.

3. **Parser known fragility areas** (may still need fixes after runtime testing):
   - Field access chains in method calls (`AbstractShape.count` as getstatic)
   - `this.field` write when `this` is implicit vs explicit
   - `super()` call detection in constructors (using `findSuperCall` heuristic)
   - Constructor body parsing (super call separation from regular body)

4. **Interpreter known gaps**:
   - `itable` is not fully populated (interface method → implementing class lookup
     relies on vtable fallback because `getInterfaceMethods` returns empty; fix when
     testing invokeinterface)
   - Static field `declaredIn` not set correctly (uses `__className` which isn't wired)

5. **UI polish deferred** (not blocking Phase 1):
   - Arrow routing through crowded layouts (works but may overlap)
   - Code panel scrolls correctly on step change

---

## Interpreter accuracy notes

The interpreter prioritizes correctness over completeness. Unsupported constructs
always throw `UnsupportedError` — never silently produce wrong output.

When a program fails, the renderer shows:
- All successfully executed steps (user can step back through them)
- Error badge in step-info panel + auto-dismiss toast
- Full app shell always accessible (mode tabs, example selector, stepper)
