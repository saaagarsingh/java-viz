/**
 * engine/languages/java/ast.ts
 *
 * Our simplified, interpreter-friendly AST for the Phase 1 Java subset.
 * The java-parser Chevrotain CST is transformed INTO this before interpretation.
 * The interpreter never touches the Chevrotain CST directly.
 *
 * Design rules:
 *  - Every node carries `loc: SourceLoc` so the renderer always has a line number.
 *  - No optional fields that could silently carry wrong semantics — use union types.
 *  - Unsupported constructs are never represented here; they throw at transform time.
 */

export interface SourceLoc {
  line:   number;
  column: number;
}

// ── Top level ─────────────────────────────────────────────────────────────────

export interface Program {
  kind:    'Program';
  classes: ClassDecl[];
}

export interface ClassDecl {
  kind:             'ClassDecl';
  name:             string;
  superclass:       string | null;
  interfaces:       string[];
  isInterface:      boolean;
  isAbstract:       boolean;
  fields:           FieldDecl[];
  staticInitBlocks: Statement[][];    // each [] is one static { ... } block
  constructors:     ConstructorDecl[];
  methods:          MethodDecl[];
  loc:              SourceLoc;
}

export interface FieldDecl {
  kind:        'FieldDecl';
  name:        string;
  type:        JavaType;
  initializer: Expr | null;
  isStatic:    boolean;
  loc:         SourceLoc;
}

export interface ConstructorDecl {
  kind:   'ConstructorDecl';
  name:   string;           // same as class name
  params: ParamDecl[];
  body:   Statement[];
  loc:    SourceLoc;
}

export interface MethodDecl {
  kind:       'MethodDecl';
  name:       string;
  returnType: JavaType;
  params:     ParamDecl[];
  body:       Statement[] | null;  // null = abstract / interface default
  isStatic:   boolean;
  isAbstract: boolean;
  loc:        SourceLoc;
}

export interface ParamDecl {
  name: string;
  type: JavaType;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type JavaType =
  | { kind: 'void' }
  | { kind: 'int'    }
  | { kind: 'long'   }
  | { kind: 'double' }
  | { kind: 'float'  }
  | { kind: 'boolean'}
  | { kind: 'char'   }
  | { kind: 'String' }            // modeled as a value, not a heap KlassInfo
  | { kind: 'ref'; className: string };

export const VOID_TYPE:    JavaType = { kind: 'void' };
export const INT_TYPE:     JavaType = { kind: 'int' };
export const BOOLEAN_TYPE: JavaType = { kind: 'boolean' };
export const DOUBLE_TYPE:  JavaType = { kind: 'double' };
export const STRING_TYPE:  JavaType = { kind: 'String' };

// ── Statements ────────────────────────────────────────────────────────────────

export type Statement =
  | LocalVarDecl
  | ExprStmt
  | ReturnStmt
  | IfStmt
  | ForStmt
  | WhileStmt
  | BlockStmt
  | BreakStmt
  | ContinueStmt;

export interface LocalVarDecl {
  kind:        'LocalVarDecl';
  name:        string;
  type:        JavaType;
  initializer: Expr | null;
  loc:         SourceLoc;
}

export interface ExprStmt {
  kind: 'ExprStmt';
  expr: Expr;
  loc:  SourceLoc;
}

export interface ReturnStmt {
  kind:  'ReturnStmt';
  value: Expr | null;
  loc:   SourceLoc;
}

export interface IfStmt {
  kind:      'IfStmt';
  condition: Expr;
  then:      Statement[];
  else_:     Statement[] | null;
  loc:       SourceLoc;
}

export interface ForStmt {
  kind:      'ForStmt';
  init:      Statement | null;
  condition: Expr | null;
  update:    ExprStmt | null;
  body:      Statement[];
  loc:       SourceLoc;
}

export interface WhileStmt {
  kind:      'WhileStmt';
  condition: Expr;
  body:      Statement[];
  loc:       SourceLoc;
}

export interface BlockStmt {
  kind:       'BlockStmt';
  statements: Statement[];
  loc:        SourceLoc;
}

export interface BreakStmt {
  kind: 'BreakStmt';
  loc:  SourceLoc;
}

export interface ContinueStmt {
  kind: 'ContinueStmt';
  loc:  SourceLoc;
}

// ── Expressions ──────────────────────────────────────────────────────────────

export type Expr =
  | IntLiteral
  | LongLiteral
  | DoubleLiteral
  | BoolLiteral
  | CharLiteral
  | StringLiteral
  | NullLiteral
  | VarExpr
  | ThisExpr
  | FieldAccessExpr
  | StaticFieldAccessExpr
  | MethodCallExpr
  | StaticMethodCallExpr
  | SuperCallExpr
  | NewObjectExpr
  | AssignExpr
  | CompoundAssignExpr
  | BinaryExpr
  | UnaryExpr
  | TernaryExpr
  | InstanceofExpr
  | PrintlnExpr;        // System.out.println modeled as a first-class expr

export interface IntLiteral    { kind: 'IntLiteral';    value: number;  loc: SourceLoc }
export interface LongLiteral   { kind: 'LongLiteral';   value: number;  loc: SourceLoc }
export interface DoubleLiteral { kind: 'DoubleLiteral'; value: number;  loc: SourceLoc }
export interface BoolLiteral   { kind: 'BoolLiteral';   value: boolean; loc: SourceLoc }
export interface CharLiteral   { kind: 'CharLiteral';   value: string;  loc: SourceLoc }
export interface StringLiteral { kind: 'StringLiteral'; value: string;  loc: SourceLoc }
export interface NullLiteral   { kind: 'NullLiteral';                   loc: SourceLoc }

export interface VarExpr {
  kind: 'VarExpr';
  name: string;
  loc:  SourceLoc;
}

export interface ThisExpr {
  kind: 'ThisExpr';
  loc:  SourceLoc;
}

/** Instance field read: `obj.field` */
export interface FieldAccessExpr {
  kind:   'FieldAccessExpr';
  object: Expr;
  field:  string;
  loc:    SourceLoc;
}

/** Static field read: `ClassName.field` */
export interface StaticFieldAccessExpr {
  kind:      'StaticFieldAccessExpr';
  className: string;
  field:     string;
  loc:       SourceLoc;
}

/** Instance method call: `obj.method(args)` or `method(args)` on implicit this */
export interface MethodCallExpr {
  kind:     'MethodCallExpr';
  receiver: Expr;       // `this` for unqualified calls
  method:   string;
  args:     Expr[];
  loc:      SourceLoc;
}

/** Static method call: `ClassName.method(args)` */
export interface StaticMethodCallExpr {
  kind:      'StaticMethodCallExpr';
  className: string;
  method:    string;
  args:      Expr[];
  loc:       SourceLoc;
}

/** super(args) — only valid as first stmt of constructor */
export interface SuperCallExpr {
  kind: 'SuperCallExpr';
  args: Expr[];
  loc:  SourceLoc;
}

export interface NewObjectExpr {
  kind:      'NewObjectExpr';
  className: string;
  args:      Expr[];
  loc:       SourceLoc;
}

/** Simple assignment: `target = value` */
export interface AssignExpr {
  kind:   'AssignExpr';
  target: VarExpr | FieldAccessExpr | StaticFieldAccessExpr;
  value:  Expr;
  loc:    SourceLoc;
}

/** Compound assignment: `target += value` etc. */
export interface CompoundAssignExpr {
  kind:   'CompoundAssignExpr';
  op:     '+=' | '-=' | '*=' | '/=' | '%=';
  target: VarExpr | FieldAccessExpr | StaticFieldAccessExpr;
  value:  Expr;
  loc:    SourceLoc;
}

export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '<' | '>' | '<=' | '>='
  | '&&' | '||';

export interface BinaryExpr {
  kind:  'BinaryExpr';
  op:    BinaryOp;
  left:  Expr;
  right: Expr;
  loc:   SourceLoc;
}

export type UnaryOp = '-' | '!' | '++' | '--';

export interface UnaryExpr {
  kind:    'UnaryExpr';
  op:      UnaryOp;
  operand: Expr;
  prefix:  boolean;   // true = ++x, false = x++
  loc:     SourceLoc;
}

/** Ternary: condition ? then : else_ */
export interface TernaryExpr {
  kind:      'TernaryExpr';
  condition: Expr;
  then:      Expr;
  else_:     Expr;
  loc:       SourceLoc;
}

/**
 * instanceof check: `expr instanceof ClassName`
 * JVM semantic: resolves the target class in Metaspace and walks
 * the runtime klass hierarchy. Emits a klass_pointer_follow step.
 */
export interface InstanceofExpr {
  kind:      'InstanceofExpr';
  expr:      Expr;
  className: string;
  loc:       SourceLoc;
}

/** System.out.println(args) — modeled directly, no classpath needed */
export interface PrintlnExpr {
  kind: 'PrintlnExpr';
  args: Expr[];
  loc:  SourceLoc;
}
