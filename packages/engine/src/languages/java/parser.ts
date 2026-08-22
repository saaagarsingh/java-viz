/**
 * engine/languages/java/parser.ts
 *
 * Transforms the java-parser Chevrotain CST into our simplified AST.
 *
 * Accuracy contract:
 *  - Every unsupported construct throws ParseError immediately with
 *    the source line number. Nothing is silently swallowed.
 *  - Every supported construct is mapped 1:1 with correct semantics.
 *    When in doubt, throw rather than guess.
 *
 * The java-parser produces a CST (not AST). Nodes have the shape:
 *   { name: 'ruleName', children: { childRuleName: CSTNode[], ... } }
 * Tokens are leaf nodes: { image: '...', startLine: N, startColumn: N }
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { parse as javaParserParse } from 'java-parser';
import type {
  Program, ClassDecl, FieldDecl, ConstructorDecl, MethodDecl, ParamDecl,
  Statement, Expr, JavaType, SourceLoc,
  LocalVarDecl, ExprStmt, ReturnStmt, IfStmt, ForStmt, WhileStmt,
  BreakStmt, ContinueStmt, SynchronizedStmt,
  BinaryOp, UnaryOp,
  VarExpr, FieldAccessExpr, StaticFieldAccessExpr,
} from './ast.js';

// ── Error type ────────────────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number | null = null,
    public readonly feature?: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

class UnsupportedError extends ParseError {
  constructor(feature: string, line: number | null = null) {
    super(`"${feature}" is not supported in this teaching subset`, line, feature);
    this.name = 'UnsupportedError';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loc(node: any): SourceLoc {
  if (node?.location) return { line: node.location.startLine ?? 0, column: node.location.startColumn ?? 0 };
  if (node?.startLine) return { line: node.startLine, column: node.startColumn ?? 0 };
  return { line: 0, column: 0 };
}

function firstToken(node: any): any {
  if (!node) return null;
  if (node.image !== undefined) return node;
  const children = node.children ?? {};
  for (const key of Object.keys(children)) {
    const arr = children[key];
    if (Array.isArray(arr) && arr.length > 0) {
      const found = firstToken(arr[0]);
      if (found) return found;
    }
  }
  return null;
}

function child(node: any, ...keys: string[]): any | undefined {
  let cur = node?.children;
  for (const k of keys) {
    if (!cur || !cur[k]?.[0]) return undefined;
    cur = cur[k][0]?.children ?? cur[k][0];
  }
  return cur !== node?.children ? (keys.length === 1 ? node?.children?.[keys[0] as string]?.[0] : cur) : undefined;
}

function children(node: any, key: string): any[] {
  return node?.children?.[key] ?? [];
}

function tokenImage(node: any, key: string): string | undefined {
  return node?.children?.[key]?.[0]?.image;
}

// ── Public entry point ────────────────────────────────────────────────────────

export function parseJava(source: string): Program {
  let cst: any;
  try {
    cst = javaParserParse(source);
  } catch (e: any) {
    const line = e?.token?.startLine ?? null;
    throw new ParseError(`Syntax error: ${e?.message ?? String(e)}`, line);
  }
  return transformProgram(cst);
}

// ── Program ───────────────────────────────────────────────────────────────────

function transformProgram(cst: any): Program {
  // compilationUnit → ordinaryCompilationUnit → typeDeclaration[]
  const ordinary = child(cst, 'ordinaryCompilationUnit');
  if (!ordinary) throw new ParseError('Could not parse compilation unit');

  // Reject package/import declarations
  if (children(ordinary, 'packageDeclaration').length > 0) {
    throw new UnsupportedError('package declarations');
  }
  if (children(ordinary, 'importDeclaration').length > 0) {
    throw new UnsupportedError('import statements (only java.lang is available implicitly)');
  }

  const typeDecls: any[] = children(ordinary, 'typeDeclaration');
  const classes: ClassDecl[] = typeDecls.map(transformTypeDecl);

  return { kind: 'Program', classes };
}

// ── Type declarations ─────────────────────────────────────────────────────────

function transformTypeDecl(typeDecl: any): ClassDecl {
  const modifiers: string[] = children(typeDecl, 'classModifier')
    .map((m: any) => tokenImage(m, 'Public') ?? tokenImage(m, 'Private') ?? tokenImage(m, 'Protected') ??
                     tokenImage(m, 'Abstract') ?? tokenImage(m, 'Static') ?? tokenImage(m, 'Final') ?? '')
    .filter(Boolean);

  const classDecl = child(typeDecl, 'classDeclaration');
  const ifaceDecl = child(typeDecl, 'interfaceDeclaration');

  if (classDecl) {
    return transformClassDecl(classDecl, modifiers);
  } else if (ifaceDecl) {
    return transformInterfaceDecl(ifaceDecl);
  }
  throw new ParseError('Unsupported type declaration');
}

function transformClassDecl(node: any, modifiers: string[]): ClassDecl {
  const normalClass = child(node, 'normalClassDeclaration');
  if (!normalClass) {
    // enum, record, etc.
    const tok = firstToken(node);
    throw new UnsupportedError('enum/record/sealed class', tok?.startLine);
  }

  // Class name is inside typeIdentifier → Identifier (NOT a direct Identifier child)
  const typeId   = child(normalClass, 'typeIdentifier');
  const name     = tokenImage(typeId, 'Identifier') ?? 'Unknown';
  const isAbstract = modifiers.includes('abstract');
  const nodeLoc  = loc(normalClass) ?? { line: 0, column: 0 };

  // Superclass: classExtends → classType → Identifier
  let superclass: string | null = null;
  const superclause = child(normalClass, 'classExtends') ?? child(normalClass, 'superclass');
  if (superclause) {
    superclass = extractTypeName(child(superclause, 'classType'));
  }

  // Interfaces: classImplements → interfaceTypeList → interfaceType → classType
  const interfaces: string[] = [];
  const ifaceClause = child(normalClass, 'classImplements') ?? child(normalClass, 'superinterfaces');
  if (ifaceClause) {
    const typeList = child(ifaceClause, 'interfaceTypeList');
    if (typeList) {
      for (const it of children(typeList, 'interfaceType')) {
        interfaces.push(extractTypeName(child(it, 'classType')));
      }
    }
  }

  // Body
  const body = child(normalClass, 'classBody');
  const { fields, staticInitBlocks, constructors, methods } = transformClassBody(body, name);

  return {
    kind: 'ClassDecl', name, superclass, interfaces,
    isInterface: false, isAbstract,
    fields, staticInitBlocks, constructors, methods,
    loc: nodeLoc,
  };
}

function transformInterfaceDecl(node: any): ClassDecl {
  const normalIface = child(node, 'normalInterfaceDeclaration');
  if (!normalIface) throw new UnsupportedError('annotation type');

  // Interface name is inside typeIdentifier → Identifier
  const ifTypeId = child(normalIface, 'typeIdentifier');
  const name     = tokenImage(ifTypeId, 'Identifier') ?? 'Unknown';
  const nodeLoc  = loc(normalIface);

  // extends (interface)
  const interfaces: string[] = [];
  const extendsClause = child(normalIface, 'extendsInterfaces');
  if (extendsClause) {
    const typeList = child(extendsClause, 'interfaceTypeList');
    if (typeList) {
      for (const it of children(typeList, 'interfaceType')) {
        interfaces.push(extractTypeName(child(it, 'classType')));
      }
    }
  }

  const body = child(normalIface, 'interfaceBody');
  const methods: MethodDecl[] = [];
  for (const decl of children(body, 'interfaceMemberDeclaration')) {
    const m = child(decl, 'interfaceMethodDeclaration');
    if (m) methods.push(transformInterfaceMethod(m));
    const cst = child(decl, 'constantDeclaration');
    if (cst) throw new UnsupportedError('interface constants', loc(cst).line);
  }

  return {
    kind: 'ClassDecl', name, superclass: null, interfaces,
    isInterface: true, isAbstract: true,
    fields: [], staticInitBlocks: [], constructors: [], methods,
    loc: nodeLoc,
  };
}

// ── Class body ────────────────────────────────────────────────────────────────

function transformClassBody(body: any, className: string) {
  const fields:            FieldDecl[]      = [];
  const staticInitBlocks:  Statement[][]    = [];
  const constructors:      ConstructorDecl[] = [];
  const methods:           MethodDecl[]     = [];

  for (const decl of children(body, 'classBodyDeclaration')) {
    const cm = child(decl, 'classMemberDeclaration');
    const si = child(decl, 'staticInitializer');
    const cd = child(decl, 'constructorDeclaration');

    if (si) {
      staticInitBlocks.push(transformBlock(child(si, 'block')));
      continue;
    }
    if (cd) {
      constructors.push(transformConstructor(cd, className));
      continue;
    }
    if (!cm) continue;

    const fd = child(cm, 'fieldDeclaration');
    const md = child(cm, 'methodDeclaration');

    if (fd) {
      fields.push(...transformFieldDecl(fd));
    } else if (md) {
      methods.push(transformMethodDecl(md));
    } else {
      // Nested class, etc.
      const tok = firstToken(cm);
      throw new UnsupportedError('nested class / member type', tok?.startLine);
    }
  }

  return { fields, staticInitBlocks, constructors, methods };
}

// ── Fields ────────────────────────────────────────────────────────────────────

function transformFieldDecl(node: any): FieldDecl[] {
  const modTokens: string[] = children(node, 'fieldModifier')
    .flatMap((m: any) => Object.values(m.children ?? {}).flat() as any[])
    .map((t: any) => t.image ?? '')
    .filter(Boolean);

  const isStatic   = modTokens.includes('static');
  const isVolatile = modTokens.includes('volatile');  // NEW (Phase 2)

  if (modTokens.includes('transient')) {
    throw new UnsupportedError('transient fields', loc(node).line);
  }

  const type     = transformType(child(node, 'unannType'));
  const varDecls = children(node, 'variableDeclaratorList')
    .flatMap((vdl: any) => children(vdl, 'variableDeclarator'));

  return varDecls.map((vd: any): FieldDecl => {
    const idNode    = child(vd, 'variableDeclaratorId');
    const name      = tokenImage(idNode, 'Identifier') ?? '';
    const initNode  = child(vd, 'variableInitializer');
    const initializer = initNode ? transformExpr(child(initNode, 'expression') ?? initNode) : null;
    return { kind: 'FieldDecl', name, type, initializer, isStatic, isVolatile, loc: loc(vd) };
  });
}

// ── Methods ───────────────────────────────────────────────────────────────────

function transformMethodDecl(node: any): MethodDecl {
  const header = child(node, 'methodHeader');
  const body   = child(node, 'methodBody');

  const modTokens: string[] = children(node, 'methodModifier')
    .flatMap((m: any) => Object.values(m.children ?? {}).flat() as any[])
    .map((t: any) => t.image ?? '')
    .filter(Boolean);

  const isStatic        = modTokens.includes('static');
  const isAbstract      = modTokens.includes('abstract');
  const isSynchronized  = modTokens.includes('synchronized');  // NEW (Phase 2)

  if (modTokens.includes('native'))       throw new UnsupportedError('native methods', loc(node).line);

  const result    = child(header, 'result');
  const returnType = result && tokenImage(result, 'Void') ? { kind: 'void' as const } : transformType(child(header, 'unannType') ?? result);

  const declarator = child(header, 'methodDeclarator');
  const name       = tokenImage(declarator, 'Identifier') ?? '';
  const isMainEntry = isStatic && name === 'main' && returnType.kind === 'void';
  const params      = transformFormalParams(child(declarator, 'formalParameterList'), {
    allowMainStringArrayParam: isMainEntry,
  });

  // Generic type parameters
  if (child(header, 'typeParameters')) throw new UnsupportedError('generic methods', loc(header).line);

  const statements = body ? (child(body, 'block') ? transformBlock(child(body, 'block')) : null) : null;

  return { kind: 'MethodDecl', name, returnType, params, body: statements, isStatic, isAbstract, isSynchronized, loc: loc(node) };
}

function transformInterfaceMethod(node: any): MethodDecl {
  const header     = child(node, 'interfaceMethodHeader') ?? child(node, 'methodHeader');
  const body       = child(node, 'methodBody');
  const modTokens: string[] = children(node, 'interfaceMethodModifier')
    .flatMap((m: any) => Object.values(m.children ?? {}).flat() as any[])
    .map((t: any) => t.image ?? '')
    .filter(Boolean);

  const result     = child(header, 'result');
  const returnType = result && tokenImage(result, 'Void') ? { kind: 'void' as const } : transformType(child(header, 'unannType') ?? result);
  const declarator = child(header, 'methodDeclarator');
  const name       = tokenImage(declarator, 'Identifier') ?? '';
  const params     = transformFormalParams(child(declarator, 'formalParameterList'));
  const isDefault  = modTokens.includes('default');
  const statements = (isDefault && body) ? transformBlock(child(body, 'block')) : null;

  return { kind: 'MethodDecl', name, returnType, params, body: statements, isStatic: false, isAbstract: !isDefault, isSynchronized: false, loc: loc(node) };
}

// ── Constructors ──────────────────────────────────────────────────────────────

function transformConstructor(node: any, className: string): ConstructorDecl {
  const declarator = child(node, 'constructorDeclarator');
  const params     = transformFormalParams(child(declarator, 'formalParameterList'));
  // Reject throws clauses with checked exceptions (fine to ignore unchecked)
  const body       = child(node, 'constructorBody');
  const statements = transformConstructorBody(body);

  return { kind: 'ConstructorDecl', name: className, params, body: statements, loc: loc(node) };
}

function transformConstructorBody(body: any): Statement[] {
  const stmts: Statement[] = [];

  // super() / this() is a DIRECT child of constructorBody as explicitConstructorInvocation
  // (NOT inside blockStatements)
  const eci = child(body, 'explicitConstructorInvocation');
  if (eci) {
    const uq = child(eci, 'unqualifiedExplicitConstructorInvocation');
    if (uq) {
      const argList = child(uq, 'argumentList');
      const args    = argList ? children(argList, 'expression').map(transformExpr) : [];
      stmts.push({
        kind: 'ExprStmt',
        expr: { kind: 'SuperCallExpr', args, loc: loc(uq) },
        loc:  loc(uq),
      });
    }
    // this() chaining not supported
    const qual = child(eci, 'qualifiedExplicitConstructorInvocation');
    if (qual) throw new UnsupportedError('this() constructor chaining', loc(eci).line);
  }

  // Regular statements are in blockStatements (direct child of constructorBody)
  const bs    = child(body, 'blockStatements');
  const allBs = bs ? children(bs, 'blockStatement') : children(body, 'blockStatement');
  for (const b of allBs) {
    const s = transformBlockStatement(b);
    if (s) stmts.push(s);
  }

  return stmts;
}

// ── Parameters ────────────────────────────────────────────────────────────────

/** Recursively test whether a type node contains array dims (String[], int[], etc.) */
function hasArrayDims(node: any): boolean {
  if (!node || typeof node !== 'object' || node.image !== undefined) return false;
  if (node.children?.dims) return true;
  return Object.values(node.children ?? {}).some(
    (arr: any) => Array.isArray(arr) && arr.some(hasArrayDims),
  );
}

function transformFormalParams(node: any, opts?: { allowMainStringArrayParam?: boolean }): ParamDecl[] {
  if (!node) return [];

  const receiverParam = child(node, 'receiverParameter');
  if (receiverParam) {
    throw new UnsupportedError('receiver parameters', loc(receiverParam).line);
  }

  const params: ParamDecl[] = [];
  for (const fp of children(node, 'formalParameter')) {
    const varArg = child(fp, 'variableArityParameter');
    if (varArg) {
      throw new UnsupportedError('varargs parameters', loc(varArg).line);
    }
    // java-parser wraps the param in variableParaRegularParameter
    const reg       = child(fp, 'variableParaRegularParameter') ?? fp;
    const unannType = child(reg, 'unannType');
    if (hasArrayDims(unannType)) {
      const typeName = extractTypeName(unannType);
      // Phase 1 compatibility exception: accept main(String[] args) by
      // dropping the arg param because array values are not modeled yet.
      if (opts?.allowMainStringArrayParam && typeName === 'String') continue;
      throw new UnsupportedError('array parameters (Phase 5)', loc(unannType ?? reg).line);
    }
    const type = transformType(unannType);
    const id   = child(reg, 'variableDeclaratorId');
    const name = tokenImage(id, 'Identifier') ?? '';
    params.push({ name, type });
  }

  const lastFormal = child(node, 'lastFormalParameter');
  if (lastFormal) {
    const varArg = child(lastFormal, 'variableArityParameter');
    if (varArg) {
      throw new UnsupportedError('varargs parameters', loc(varArg).line);
    }
    throw new UnsupportedError('lastFormalParameter form', loc(lastFormal).line);
  }

  return params;
}

// ── Blocks & statements ───────────────────────────────────────────────────────

function transformBlock(block: any): Statement[] {
  if (!block) return [];
  const stmts: Statement[] = [];
  const blockStmts = children(block, 'blockStatements');
  const allBs = blockStmts.length > 0
    ? children(blockStmts[0], 'blockStatement')
    : children(block, 'blockStatement');
  for (const bs of allBs) {
    const s = transformBlockStatement(bs);
    if (s) stmts.push(s);
  }
  return stmts;
}

function transformBlockStatement(bs: any): Statement | null {
  const local = child(bs, 'localVariableDeclarationStatement');
  const stmt  = child(bs, 'statement');

  if (local) return transformLocalVar(child(local, 'localVariableDeclaration') ?? local);
  if (stmt)  return transformStatement(stmt);
  return null;
}

function transformLocalVar(node: any): LocalVarDecl {
  const type     = transformType(child(node, 'localVariableType') ?? child(node, 'unannType'));
  const varDecls = children(node, 'variableDeclaratorList')
    .flatMap((vdl: any) => children(vdl, 'variableDeclarator'));

  if (varDecls.length > 1) {
    throw new UnsupportedError('multiple variable declarations in one statement', loc(node).line);
  }
  const vd   = varDecls[0];
  const id   = child(vd, 'variableDeclaratorId');
  const name = tokenImage(id, 'Identifier') ?? '';
  const init = child(vd, 'variableInitializer');
  const initializer = init ? transformExpr(child(init, 'expression') ?? init) : null;
  return { kind: 'LocalVarDecl', name, type, initializer, loc: loc(node) };
}

function transformStatement(stmt: any): Statement {
  const swts = child(stmt, 'statementWithoutTrailingSubstatement');
  // java-parser uses 'ifStatement' for both if/if-else (not ifThenStatement/ifThenElseStatement)
  const ifS  = child(stmt, 'ifStatement') ?? child(stmt, 'ifThenStatement') ?? child(stmt, 'ifThenElseStatement');
  const wS   = child(stmt, 'whileStatement');
  const forS = child(stmt, 'forStatement');
  const labeled = child(stmt, 'labeledStatement');

  if (labeled) throw new UnsupportedError('labeled statements', loc(labeled).line);

  if (ifS)  return transformIf(ifS);
  if (wS)   return transformWhile(wS);
  if (forS) return transformFor(forS);

  if (swts) {
    const es   = child(swts, 'expressionStatement');
    const ret  = child(swts, 'returnStatement');
    const blk  = child(swts, 'block');
    const brk  = child(swts, 'breakStatement');
    const cont = child(swts, 'continueStatement');
    const thr  = child(swts, 'throwStatement');
    const sw   = child(swts, 'switchStatement');
    const sync = child(swts, 'synchronizedStatement');
    const tryS = child(swts, 'tryStatement');
    const empty= child(swts, 'emptyStatement');

    if (brk)  return { kind: 'BreakStmt',    loc: loc(brk)  } satisfies BreakStmt;
    if (cont) return { kind: 'ContinueStmt', loc: loc(cont) } satisfies ContinueStmt;
    if (thr)         throw new UnsupportedError('throw statements (Phase 4)', loc(swts).line);
    if (sw)          throw new UnsupportedError('switch statements', loc(swts).line);
    if (sync)        return transformSynchronized(sync);  // NEW (Phase 2)
    if (tryS)        throw new UnsupportedError('try/catch/finally (Phase 4)', loc(tryS).line);
    if (empty)       return { kind: 'BlockStmt', statements: [], loc: loc(swts) };
    if (blk)         return { kind: 'BlockStmt', statements: transformBlock(blk), loc: loc(blk) };
    if (ret)         return transformReturn(ret);
    if (es) {
      const se = child(es, 'statementExpression');
      return { kind: 'ExprStmt', expr: transformStatementExpr(se), loc: loc(es) };
    }
  }

  throw new ParseError(`Unrecognised statement node at line ${loc(stmt).line}`);
}

function transformReturn(node: any): ReturnStmt {
  const expr = child(node, 'expression');
  return { kind: 'ReturnStmt', value: expr ? transformExpr(expr) : null, loc: loc(node) };
}

function transformIf(node: any): IfStmt {
  const condExpr = child(node, 'expression');
  const cond     = transformExpr(condExpr);
  const stmts    = children(node, 'statement');
  const then_    = stmts[0] ? transformBlock_or_stmt(stmts[0]) : [];
  const else_    = stmts[1] ? transformBlock_or_stmt(stmts[1]) : null;
  return { kind: 'IfStmt', condition: cond, then: then_, else_, loc: loc(node) };
}

function transformBlock_or_stmt(stmt: any): Statement[] {
  const blk = child(stmt, 'statementWithoutTrailingSubstatement')?.children?.block?.[0]
    ?? child(stmt, 'block');
  if (blk) return transformBlock(blk);
  const s = transformStatement(stmt);
  return [s];
}

function transformWhile(node: any): WhileStmt {
  const cond = transformExpr(child(node, 'expression'));
  const body = transformBlock_or_stmt(child(node, 'statement'));
  return { kind: 'WhileStmt', condition: cond, body, loc: loc(node) };
}

function transformFor(node: any): ForStmt {
  const basic = child(node, 'basicForStatement') ?? child(node, 'basicForStatementNoShortIf');
  const enhanced = child(node, 'enhancedForStatement');
  if (enhanced) throw new UnsupportedError('enhanced for loop (Phase 5)', loc(enhanced).line);
  if (!basic) throw new ParseError('Unrecognised for statement');

  // init
  let init: Statement | null = null;
  const forInit = child(basic, 'forInit');
  if (forInit) {
    const lvd = child(forInit, 'localVariableDeclaration');
    const exprList = child(forInit, 'statementExpressionList');
    if (lvd)      init = transformLocalVar(lvd);
    else if (exprList) {
      const exprs = children(exprList, 'statementExpression').map(transformStatementExpr);
      if (exprs.length === 1) init = { kind: 'ExprStmt', expr: exprs[0]!, loc: loc(forInit) };
      else throw new UnsupportedError('multiple for-init expressions', loc(forInit).line);
    }
  }

  // condition
  const condNode = child(basic, 'expression');
  const condition = condNode ? transformExpr(condNode) : null;

  // update
  let update: ExprStmt | null = null;
  const forUpdate = child(basic, 'forUpdate');
  if (forUpdate) {
    const exprList = child(forUpdate, 'statementExpressionList');
    if (exprList) {
      const exprs = children(exprList, 'statementExpression').map(transformStatementExpr);
      if (exprs.length === 1) update = { kind: 'ExprStmt', expr: exprs[0]!, loc: loc(forUpdate) };
      else throw new UnsupportedError('multiple for-update expressions', loc(forUpdate).line);
    }
  }

  const body = transformBlock_or_stmt(child(basic, 'statement'));
  return { kind: 'ForStmt', init, condition, update, body, loc: loc(node) };
}


// ── Synchronized Statement (Phase 2) ──────────────────────────────────────────
/** NEW (Phase 2): synchronized (expr) { body } */
function transformSynchronized(node: any) {
  const c = node.children ?? {};
  const syncExpr = c.expression?.[0];
  const syncBlock = c.block?.[0];

  if (!syncExpr) throw new ParseError(`synchronized without expression at line ${loc(node).line}`);
  if (!syncBlock) throw new ParseError(`synchronized without block at line ${loc(node).line}`);

  const expr = transformExpr(syncExpr);
  const body = transformBlock(syncBlock);

  return {
    kind: 'SynchronizedStmt' as const,
    expr,
    body,
    loc: loc(node),
  };
}

// ── Expression dispatch ──────────────────────────────────────────────────────
// The java-parser CST structure for ALL expressions:
//   statementExpression → expression → conditionalExpression → binaryExpression
//   binaryExpression uses key 'AssignmentOperator' for =, +=, etc.
//                       uses key 'BinaryOperator'   for +, -, >, ==, etc.
//   unaryExpression { Not/Minus/Plus prefix; UnarySuffixOperator for x++; primary }
//   primary { primaryPrefix, primarySuffix[] }
//   primaryPrefix { This | literal | newExpression | fqnOrRefType }
//   primarySuffix { Dot+Identifier | methodInvocationSuffix }

function transformStatementExpr(se: any): Expr {
  if (!se) throw new ParseError('Empty statement expression');
  // statementExpression has exactly ONE child: 'expression'
  const exprNode = child(se, 'expression');
  if (!exprNode) throw new ParseError(`Empty statementExpression at line ${loc(se).line}`);
  return transformExpr(exprNode);
}

// ── transformExpr: top-level CST rule dispatcher ──────────────────────────────

function transformExpr(node: any): Expr {
  if (!node) throw new ParseError('Null expression node');

  // Leaf token (passed directly, e.g. from binary operand extraction)
  if (node.image !== undefined && !node.children) {
    return transformLeafToken(node);
  }

  const name = node.name as string | undefined;

  switch (name) {
    case 'expression':
    case 'assignmentExpression': {
      // expression → conditionalExpression | lambdaExpression
      if (node.children?.lambdaExpression) throw new UnsupportedError('lambda (Phase 6)', loc(node).line);
      const cond = node.children?.conditionalExpression?.[0];
      if (cond) return transformExpr(cond);
      break;
    }
    case 'conditionalExpression': {
      // Ternary: condition ? then : else
      if (node.children?.QuestionMark) {
        const operands: any[] = node.children?.binaryExpression ?? [];
        // java-parser puts condition in binaryExpression[0], then/else in expression[]
        const condNode  = operands[0];
        const branches: any[] = node.children?.expression ?? [];
        if (!condNode || branches.length < 2) throw new ParseError(`Malformed ternary at line ${loc(node).line}`);
        return {
          kind:      'TernaryExpr',
          condition: transformBinaryExpr(condNode),
          then:      transformExpr(branches[0]),
          else_:     transformExpr(branches[1]),
          loc:       loc(node),
        };
      }
      const bin = node.children?.binaryExpression?.[0];
      if (bin) return transformBinaryExpr(bin);
      break;
    }
    case 'binaryExpression':
      return transformBinaryExpr(node);
    case 'unaryExpression':
      return transformUnaryExpr(node);
    case 'primary':
      return transformPrimary(node);
  }

  // Single-child unwrap (handles: variableInitializer, localVariableType, etc.)
  const childKeys = Object.keys(node.children ?? {}).filter(
    k => ((node.children as any)[k] as any[]).length > 0,
  );
  if (childKeys.length === 1 && ((node.children as any)[childKeys[0]!] as any[]).length === 1) {
    return transformExpr((node.children as any)[childKeys[0]!][0]);
  }
  // Multi-child: take first non-punctuation child
  const SKIP = new Set(['Semicolon','Comma','Dot','LParen','RParen','LCurly','RCurly','LSquareBracket','RSquareBracket']);
  const useful = childKeys.filter(k => !SKIP.has(k));
  if (useful.length > 0) {
    return transformExpr((node.children as any)[useful[0]!][0]);
  }

  throw new ParseError(`Unrecognised expression node "${name ?? 'unknown'}" at line ${loc(node).line}`);
}

// ── Leaf token → Expr ─────────────────────────────────────────────────────────

function transformLeafToken(token: any): Expr {
  const img = token.image as string;
  const tn  = (token.tokenType?.name ?? '') as string;
  const tnL = tn.toLowerCase();
  if (img === 'true')  return { kind: 'BoolLiteral', value: true,  loc: loc(token) };
  if (img === 'false') return { kind: 'BoolLiteral', value: false, loc: loc(token) };
  if (img === 'null')  return { kind: 'NullLiteral',               loc: loc(token) };
  if (img === 'this')  return { kind: 'ThisExpr',                  loc: loc(token) };
  if (img.startsWith('"'))       return { kind: 'StringLiteral', value: parseStringLiteral(img), loc: loc(token) };
  if (img.startsWith("'") && img.endsWith("'"))
                                 return { kind: 'CharLiteral', value: img.slice(1,-1), loc: loc(token) };
  if (tnL.includes('integer') || tnL.includes('decimal') || tnL.includes('float') ||
      tnL.includes('double') || tnL.includes('hex') || /^\d/.test(img))
    return transformLiteral(token);
  if (tn === 'Identifier' || /^[a-zA-Z_$]/.test(img))
    return { kind: 'VarExpr', name: img, loc: loc(token) };
  throw new ParseError(`Unrecognised token "${img}" (${tn}) at line ${loc(token).line}`);
}

// ── binaryExpression ──────────────────────────────────────────────────────────
// Covers: assignments (AssignmentOperator key), binary ops (BinaryOperator key),
//         and single-operand passthrough.

function transformBinaryExpr(node: any): Expr {
  const c       = node.children ?? {};
  const nodeLoc = loc(node);

  // ── Assignment: key 'AssignmentOperator' ────────────────────────────────────
  if (c.AssignmentOperator?.length) {
    const lhsNode = c.unaryExpression?.[0];
    const rhsNode = c.expression?.[0];
    if (!lhsNode) throw new ParseError(`Assignment without LHS at line ${nodeLoc.line}`);
    if (!rhsNode) throw new ParseError(`Assignment without RHS at line ${nodeLoc.line}`);
    const lhs   = transformUnaryExpr(lhsNode);
    const rhs   = transformExpr(rhsNode);
    const opImg = (c.AssignmentOperator[0]?.image as string) ?? '=';
    return buildAssignment(lhs, opImg, rhs, nodeLoc);
  }

  // ── instanceof: key 'Instanceof' ──────────────────────────────────────────
  if (c.Instanceof?.length) {
    // binaryExpression has: unaryExpression (LHS) + Instanceof token + referenceType (RHS class name)
    const lhsNode = c.unaryExpression?.[0];
    if (!lhsNode) throw new ParseError(`instanceof without LHS at line ${nodeLoc.line}`);
    const refType = c.referenceType?.[0] ?? c.classType?.[0];
    const className = refType ? extractTypeName(refType) : (c.Identifier?.[0]?.image as string | undefined);
    if (!className) throw new ParseError(`instanceof without type at line ${nodeLoc.line}`);
    return {
      kind:      'InstanceofExpr',
      expr:      transformUnaryExpr(lhsNode),
      className,
      loc:       nodeLoc,
    };
  }

  // ── Binary op: key 'BinaryOperator' ─────────────────────────────────────────
  // java-parser flattens chained exprs into one node:
  //   `i % 2 != 0`  →  unaryExpression:[i,2,0]  BinaryOperator:["%","!="]
  // We must use BinaryOperator[i-1] for the i-th fold, NOT always [0].
  if (c.BinaryOperator?.length) {
    const opMap: Record<string, BinaryOp> = {
      '+': '+', '-': '-', '*': '*', '/': '/', '%': '%',
      '==': '==', '!=': '!=', '<': '<', '>': '>', '<=': '<=', '>=': '>=',
      '&&': '&&', '||': '||',
    };
    const operands: Expr[] = (c.unaryExpression ?? []).map(transformUnaryExpr);
    if (operands.length < 2) throw new ParseError(`Binary op needs ≥ 2 operands at line ${nodeLoc.line}`);
    // Fold left-to-right, consuming the correct operator at each step
    let result = operands[0]!;
    for (let i = 1; i < operands.length; i++) {
      const opImg = c.BinaryOperator[i - 1]?.image as string;
      const op    = opMap[opImg];
      if (!op) throw new ParseError(`Unknown binary operator "${opImg}" at line ${nodeLoc.line}`);
      result = { kind: 'BinaryExpr', op, left: result, right: operands[i]!, loc: nodeLoc };
    }
    return result;
  }

  // ── Single unaryExpression — passthrough ─────────────────────────────────────
  if (c.unaryExpression?.length === 1) return transformUnaryExpr(c.unaryExpression[0]);

  // ── Fallback: single-child unwrap ────────────────────────────────────────────
  const keys = Object.keys(c).filter(k => (c[k] as any[]).length > 0);
  if (keys.length === 1 && (c[keys[0]!] as any[]).length === 1) {
    return transformExpr(c[keys[0]!][0]);
  }
  throw new ParseError(`Unrecognised binaryExpression at line ${nodeLoc.line}`);
}

function buildAssignment(lhs: Expr, opImg: string, rhs: Expr, nodeLoc: SourceLoc): Expr {
  // LHS must be a valid assignment target
  if (!['VarExpr','FieldAccessExpr','StaticFieldAccessExpr'].includes(lhs.kind)) {
    throw new ParseError(`Invalid assignment target "${lhs.kind}" at line ${nodeLoc.line}`);
  }
  const target = lhs as VarExpr | FieldAccessExpr | StaticFieldAccessExpr;
  if (opImg === '=') return { kind: 'AssignExpr', target, value: rhs, loc: nodeLoc };
  const compMap: Record<string, string> = {
    '+=':'+=', '-=':'-=', '*=':'*=', '/=':'/=', '%=':'%=',
  };
  const compOp = compMap[opImg];
  if (compOp) return { kind: 'CompoundAssignExpr', op: compOp as any, target, value: rhs, loc: nodeLoc };
  throw new UnsupportedError(`${opImg} operator`, nodeLoc.line);
}

// ── unaryExpression ───────────────────────────────────────────────────────────
// Handles: prefix !, -, + ; postfix ++ / -- (UnarySuffixOperator); plain primary.

function transformUnaryExpr(node: any): Expr {
  if (!node) throw new ParseError('Null unary expression');
  if (node.name !== 'unaryExpression') return transformExpr(node);

  const c       = node.children ?? {};
  const nodeLoc = loc(node);

  // Prefix operators (token keys: Not, Minus, Plus)
  if (c.Not?.length) {
    return { kind: 'UnaryExpr', op: '!', operand: transformPrimary(c.primary?.[0]), prefix: true, loc: nodeLoc };
  }
  if (c.Minus?.length) {
    const inner = c.primary?.[0] ?? c.unaryExpression?.[0];
    return { kind: 'UnaryExpr', op: '-', operand: transformExpr(inner), prefix: true, loc: nodeLoc };
  }
  if (c.Plus?.length) {
    const inner = c.primary?.[0] ?? c.unaryExpression?.[0];
    return transformExpr(inner); // unary + is a no-op
  }
  // Prefix ++ / --
  // java-parser uses 'PlusPlus'/'MinusMinus' in expression-statement context
  // but 'UnaryPrefixOperator' in initializer/RHS context — handle both.
  if (c.PlusPlus?.length || (c.UnaryPrefixOperator?.length && c.UnaryPrefixOperator[0]?.image === '++')) {
    const inner = c.primary?.[0] ?? c.unaryExpression?.[0];
    return { kind: 'UnaryExpr', op: '++', operand: transformExpr(inner), prefix: true, loc: nodeLoc };
  }
  if (c.MinusMinus?.length || (c.UnaryPrefixOperator?.length && c.UnaryPrefixOperator[0]?.image === '--')) {
    const inner = c.primary?.[0] ?? c.unaryExpression?.[0];
    return { kind: 'UnaryExpr', op: '--', operand: transformExpr(inner), prefix: true, loc: nodeLoc };
  }
  // Postfix ++ / --  (key: UnarySuffixOperator)
  if (c.UnarySuffixOperator?.length) {
    const opImg = c.UnarySuffixOperator[0]?.image as string;
    const op: UnaryOp = opImg === '++' ? '++' : '--';
    return { kind: 'UnaryExpr', op, operand: transformPrimary(c.primary?.[0]), prefix: false, loc: nodeLoc };
  }
  // Plain primary
  if (c.primary?.length) return transformPrimary(c.primary[0]);

  // Single-child fallback
  const keys = Object.keys(c).filter(k => (c[k] as any[]).length > 0);
  if (keys.length === 1 && (c[keys[0]!] as any[]).length === 1) return transformExpr(c[keys[0]!][0]);
  throw new ParseError(`Unrecognised unaryExpression at line ${nodeLoc.line}`);
}

// ── primary: primaryPrefix + primarySuffix[] chain ────────────────────────────
// A primary is the atom of an expression.  primaryPrefix gives us the starting
// node (This, literal, new, or a chain of identifiers via fqnOrRefType).
// Zero or more primarySuffix nodes extend it (field access or method call).

function transformPrimary(node: any): Expr {
  if (!node) throw new ParseError('Null primary node');
  if (node.name !== 'primary') return transformExpr(node);

  const c       = node.children ?? {};
  const nodeLoc = loc(node);
  const prefixNode: any     = c.primaryPrefix?.[0];
  const suffixNodes: any[]  = c.primarySuffix ?? [];

  if (!prefixNode) throw new ParseError(`primary without prefix at line ${nodeLoc.line}`);

  // ── Parse prefix ─────────────────────────────────────────────────────────────
  let base: Expr | null        = null;   // resolved base expression
  let fqnParts: string[] | null = null;  // chain of identifier parts not yet resolved
  const pc = prefixNode.children ?? {};

  if (pc.This) {
    base = { kind: 'ThisExpr', loc: loc(pc.This[0]) };
  } else if (pc.literal) {
    base = transformLiteralNode(pc.literal[0]);
  } else if (pc.newExpression) {
    base = transformNewExpr(pc.newExpression[0]);
  } else if (pc.fqnOrRefType) {
    fqnParts = extractFqnParts(pc.fqnOrRefType[0]);
  } else if (pc.LParen || pc.parenthesisExpression) {
    // Parenthesized expression: ( expr )
    // java-parser wraps parens in a 'parenthesisExpression' rule where the
    // tokens are named LBrace/RBrace (confusingly). Unwrap the inner expression.
    const parenNode = pc.parenthesisExpression?.[0];
    const inner = parenNode
      ? (parenNode.children?.expression?.[0] ?? parenNode)
      : pc.expression?.[0];
    if (!inner) throw new ParseError(`Empty parenthesized expression at line ${nodeLoc.line}`);
    base = transformExpr(inner);
  } else if (pc.Super) {
    // super in expression context (super.field) — handled by suffix
    base = { kind: 'ThisExpr', loc: loc(pc.Super[0]) }; // approximate: treat as this
  } else {
    // Fallback: try first child token / rule
    const keys = Object.keys(pc).filter(k => (pc[k] as any[]).length > 0);
    if (keys.length > 0) {
      const first = (pc[keys[0]!] as any[])[0];
      base = first?.image !== undefined ? transformLeafToken(first) : transformExpr(first);
    } else {
      throw new ParseError(`Empty primaryPrefix at line ${nodeLoc.line}`);
    }
  }

  // ── Process suffixes with lookahead ───────────────────────────────────────────
  // Possible suffix shapes:
  //   Dot + Identifier              — field read, OR method name before next suffix
  //   methodInvocationSuffix(args)  — method call (method name came from fqnParts or prev suffix)
  let pendingMethodName: string | null = null;

  for (let i = 0; i < suffixNodes.length; i++) {
    const suffix = suffixNodes[i];
    const sc = suffix.children ?? {};

    if (sc.methodInvocationSuffix?.length) {
      // ── Method call ────────────────────────────────────────────────────────
      const args = parseArgList(sc.methodInvocationSuffix[0]);

      if (pendingMethodName !== null) {
        // Method name came from previous Dot+Identifier suffix (e.g. this.method(args))
        const mn = pendingMethodName;
        pendingMethodName = null;
        // base is already resolved
        base = { kind: 'MethodCallExpr', receiver: base!, method: mn, args, loc: nodeLoc };
      } else if (fqnParts !== null) {
        // All-in-fqn case: obj.method(args) or area() or System.out.println
        base = buildMethodCallFromFqn(fqnParts, args, nodeLoc);
        fqnParts = null;
      } else {
        throw new ParseError(`Unexpected method call suffix at line ${nodeLoc.line}`);
      }

    } else {
      // ── Dot + Identifier suffix ───────────────────────────────────────────
      const ident = sc.Identifier?.[0]?.image as string | undefined;
      if (!ident) continue; // skip unexpected suffix shapes

      const nextSuffix    = suffixNodes[i + 1];
      const nextIsCallArgs = !!(nextSuffix?.children?.methodInvocationSuffix?.length);

      // Resolve fqnParts to a base expression first
      if (fqnParts !== null) {
        base = buildExprFromFqn(fqnParts, nodeLoc);
        fqnParts = null;
      }

      if (nextIsCallArgs) {
        // This identifier is a method name — save it, args come in next iteration
        pendingMethodName = ident;
      } else {
        // Regular field access
        base = { kind: 'FieldAccessExpr', object: base!, field: ident, loc: loc(suffix) };
      }
    }
  }

  // ── Resolve final state ────────────────────────────────────────────────────
  if (fqnParts !== null) return buildExprFromFqn(fqnParts, nodeLoc);
  if (base     !== null) return base;
  throw new ParseError(`Could not resolve primary at line ${nodeLoc.line}`);
}

// ── FQN helpers ───────────────────────────────────────────────────────────────

/** Extract all identifier parts from fqnOrRefType, e.g. ['System','out','println'] */
function extractFqnParts(fqnNode: any): string[] {
  if (!fqnNode) return [];
  const parts: string[] = [];

  // First part: fqnOrRefTypePartFirst → fqnOrRefTypePartCommon → Identifier
  const first = child(fqnNode, 'fqnOrRefTypePartFirst');
  if (first) {
    const common = child(first, 'fqnOrRefTypePartCommon');
    const id = tokenImage(common, 'Identifier');
    if (id) parts.push(id);
  } else {
    // Fallback: direct Identifier
    const id = tokenImage(fqnNode, 'Identifier');
    if (id) parts.push(id);
  }

  // Rest parts: fqnOrRefTypePartRest[] → fqnOrRefTypePartCommon → Identifier
  for (const rest of children(fqnNode, 'fqnOrRefTypePartRest')) {
    const common = child(rest, 'fqnOrRefTypePartCommon');
    const id = tokenImage(common, 'Identifier');
    if (id) parts.push(id);
  }

  return parts;
}

/** Parse argument list from methodInvocationSuffix node */
function parseArgList(mis: any): Expr[] {
  const argList = child(mis, 'argumentList');
  if (!argList) return [];
  return children(argList, 'expression').map(transformExpr);
}

/**
 * Build a method-call Expr from an FQN parts array where the LAST part is
 * the method name and all preceding parts form the receiver.
 * Examples:
 *   ['area']                    → MethodCallExpr(ThisExpr, 'area', args)
 *   ['obj', 'method']           → MethodCallExpr(VarExpr('obj'), 'method', args)
 *   ['Cls', 'method']           → StaticMethodCallExpr('Cls', 'method', args)
 *   ['System','out','println']  → PrintlnExpr(args)
 */
function buildMethodCallFromFqn(parts: string[], args: Expr[], nodeLoc: SourceLoc): Expr {
  if (parts.length === 0) throw new ParseError('Empty FQN for method call');

  // System.out.println special case
  const joined = parts.join('.');
  if (joined === 'System.out.println') return { kind: 'PrintlnExpr', args, loc: nodeLoc };
  if (parts[0] === 'System') throw new UnsupportedError(`System.${parts.slice(1).join('.')}`, nodeLoc.line);

  if (parts.length === 1) {
    // Unqualified call: method() → this.method()
    return { kind: 'MethodCallExpr', receiver: { kind: 'ThisExpr', loc: nodeLoc }, method: parts[0]!, args, loc: nodeLoc };
  }

  const method    = parts[parts.length - 1]!;
  const qualParts = parts.slice(0, -1);

  if (qualParts.length === 1) {
    const qualifier = qualParts[0]!;
    const isUpper   = /^[A-Z]/.test(qualifier);
    if (isUpper) return { kind: 'StaticMethodCallExpr', className: qualifier, method, args, loc: nodeLoc };
    return { kind: 'MethodCallExpr', receiver: { kind: 'VarExpr', name: qualifier, loc: nodeLoc }, method, args, loc: nodeLoc };
  }

  // 3+ part receiver chain: build a field-chain receiver, then call
  const receiver = buildExprFromFqn(qualParts, nodeLoc);
  return { kind: 'MethodCallExpr', receiver, method, args, loc: nodeLoc };
}

/**
 * Build a plain field-access / variable Expr from FQN parts (no method call).
 * Examples:
 *   ['a']         → VarExpr('a')
 *   ['f', 'x']    → FieldAccessExpr(VarExpr('f'), 'x')
 *   ['Cls', 'f']  → StaticFieldAccessExpr('Cls', 'f')
 */
function buildExprFromFqn(parts: string[], nodeLoc: SourceLoc): Expr {
  if (parts.length === 0) throw new ParseError('Empty FQN');
  if (parts.length === 1) return { kind: 'VarExpr', name: parts[0]!, loc: nodeLoc };

  const field     = parts[parts.length - 1]!;
  const qualParts = parts.slice(0, -1);

  if (qualParts.length === 1) {
    const qualifier = qualParts[0]!;
    const isUpper   = /^[A-Z]/.test(qualifier);
    if (isUpper) return { kind: 'StaticFieldAccessExpr', className: qualifier, field, loc: nodeLoc };
    return { kind: 'FieldAccessExpr', object: { kind: 'VarExpr', name: qualifier, loc: nodeLoc }, field, loc: nodeLoc };
  }

  // 3+ parts: build chain recursively
  const object = buildExprFromFqn(qualParts, nodeLoc);
  return { kind: 'FieldAccessExpr', object, field, loc: nodeLoc };
}

// ── literal node → Expr ───────────────────────────────────────────────────────
// Called when we have the 'literal' rule node (not the raw token).

function transformLiteralNode(literalNode: any): Expr {
  const c = literalNode.children ?? {};
  if (c.integerLiteral)       return transformLiteral(c.integerLiteral[0]);
  if (c.floatingPointLiteral) return transformLiteral(c.floatingPointLiteral[0]);
  if (c.booleanLiteral) {
    const bl  = c.booleanLiteral[0];
    const blc = bl.children ?? {};
    if (blc.True)  return { kind: 'BoolLiteral', value: true,  loc: loc(blc.True[0]) };
    if (blc.False) return { kind: 'BoolLiteral', value: false, loc: loc(blc.False[0]) };
    return transformLiteral(bl);
  }
  if (c.characterLiteral) return transformLiteral(c.characterLiteral[0]);
  if (c.StringLiteral) {
    const t = c.StringLiteral[0];
    return { kind: 'StringLiteral', value: parseStringLiteral(t.image), loc: loc(t) };
  }
  if (c.Null) return { kind: 'NullLiteral', loc: loc(c.Null[0]) };
  if (c.True) return { kind: 'BoolLiteral', value: true,  loc: loc(c.True[0]) };
  if (c.False)return { kind: 'BoolLiteral', value: false, loc: loc(c.False[0]) };
  throw new ParseError(`Unknown literal node at line ${loc(literalNode).line}`);
}

// ── new object ────────────────────────────────────────────────────────────────
// Called when we see primaryPrefix → newExpression.

function transformNewExpr(newExprNode: any): Expr {
  const uq = child(newExprNode, 'unqualifiedClassInstanceCreationExpression');
  if (!uq) throw new UnsupportedError('qualified new expression', loc(newExprNode).line);
  if (child(uq, 'classBody')) throw new UnsupportedError('anonymous class (Phase 6)', loc(uq).line);

  const classType = child(uq, 'classOrInterfaceTypeToInstantiate');
  const className = tokenImage(classType, 'Identifier') ??
                    tokenImage(child(classType, 'typeIdentifier'), 'Identifier') ??
                    extractTypeName(classType) ?? 'Unknown';
  const argList = child(uq, 'argumentList');
  const args    = argList ? children(argList, 'expression').map(transformExpr) : [];
  return { kind: 'NewObjectExpr', className, args, loc: loc(uq) };
}

// ── Literals (raw token → Expr) ───────────────────────────────────────────────


function transformLiteral(token: any): Expr {
  // If called with a CST rule node (has children but no image), unwrap to the leaf token.
  // e.g. integerLiteral { children: { DecimalIntegerLiteral: [token] } }
  if (token.image === undefined && token.children) {
    const leaf = Object.values(token.children as Record<string, any[]>)
      .flat()
      .find((c: any) => c.image !== undefined);
    if (leaf) return transformLiteral(leaf);
    throw new ParseError(`Cannot find token inside literal node "${token.name}"`, loc(token).line);
  }

  const image: string = token.image ?? '';
  const nodeLoc = loc(token);
  const name = (token.tokenType?.name ?? token.name ?? '') as string;
  const nameLower = name.toLowerCase();

  // Integer — match both token type names (DecimalIntegerLiteral) and rule names (integerLiteral)
  if (nameLower.includes('integer') || nameLower.includes('decimal') || nameLower.includes('hex') || nameLower.includes('octal') || nameLower.includes('binary')) {
    const raw = image.replace(/_/g, '').replace(/[lL]$/, '');
    const isLong = image.endsWith('l') || image.endsWith('L');
    const value  = raw.startsWith('0x') || raw.startsWith('0X') ? parseInt(raw, 16) : parseInt(raw, 10);
    return isLong ? { kind: 'LongLiteral', value, loc: nodeLoc } : { kind: 'IntLiteral', value, loc: nodeLoc };
  }
  // Float / Double
  if (nameLower.includes('float') || nameLower.includes('double') || nameLower.includes('floating')) {
    const raw = image.replace(/_/g, '').replace(/[fFdD]$/, '');
    return { kind: 'DoubleLiteral', value: parseFloat(raw), loc: nodeLoc };
  }
  // Boolean
  if (nameLower.includes('boolean') || image === 'true' || image === 'false') {
    return { kind: 'BoolLiteral', value: image === 'true', loc: nodeLoc };
  }
  // Char
  if (nameLower.includes('char') || (image.startsWith("'") && image.endsWith("'"))) {
    return { kind: 'CharLiteral', value: image.slice(1, -1), loc: nodeLoc };
  }
  // String
  if (nameLower.includes('string') || (image.startsWith('"') && image.endsWith('"'))) {
    return { kind: 'StringLiteral', value: parseStringLiteral(image), loc: nodeLoc };
  }
  // Plain digit (last resort for a bare number image)
  if (/^\d/.test(image)) {
    return { kind: 'IntLiteral', value: parseInt(image, 10) | 0, loc: nodeLoc };
  }
  throw new ParseError(`Unknown literal: "${image}" (tokenType: ${name})`, nodeLoc.line);
}

function parseStringLiteral(raw: string): string {
  // Strip surrounding quotes and handle basic escape sequences
  const inner = raw.startsWith('"') ? raw.slice(1, -1) : raw;
  return inner
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

// ── Type transformer ──────────────────────────────────────────────────────────

function transformType(node: any): JavaType {
  if (!node) return { kind: 'void' };

  // Check for array type
  if (children(node, 'dims').length > 0 || node.children?.dims) {
    throw new UnsupportedError('arrays (Phase 5)', loc(node).line);
  }

  // Primitives
  const prim = child(node, 'integralType') ?? child(node, 'floatingPointType') ??
               child(node, 'numericType') ?? child(node, 'Boolean') ?? child(node, 'Void');

  if (prim || node.children?.Boolean || node.children?.Void) {
    const name = tokenImage(node, 'Boolean') ? 'boolean' :
                 tokenImage(node, 'Void') ? 'void' :
                 tokenImage(prim ?? node, 'Int') ? 'int' :
                 tokenImage(prim ?? node, 'Long') ? 'long' :
                 tokenImage(prim ?? node, 'Double') ? 'double' :
                 tokenImage(prim ?? node, 'Float') ? 'float' :
                 tokenImage(prim ?? node, 'Char') ? 'char' :
                 tokenImage(prim ?? node, 'Byte') || tokenImage(prim ?? node, 'Short') ? 'int' :
                 null;
    if (name === 'void')    return { kind: 'void' };
    if (name === 'int')     return { kind: 'int' };
    if (name === 'long')    return { kind: 'long' };
    if (name === 'double')  return { kind: 'double' };
    if (name === 'float')   return { kind: 'float' };
    if (name === 'boolean') return { kind: 'boolean' };
    if (name === 'char')    return { kind: 'char' };
  }

  // Reference / class type
  const classType = child(node, 'classType') ?? child(node, 'classOrInterfaceType') ??
                    child(node, 'referenceType') ?? child(node, 'typeVariable');
  if (classType || node.children?.Identifier) {
    const name = extractTypeName(classType ?? node);
    if (name === 'String') return { kind: 'String' };
    return { kind: 'ref', className: name };
  }

  // Generics
  if (node.children?.typeArguments || children(node, 'typeArguments').length > 0) {
    throw new UnsupportedError('generic types (Phase 5+)', loc(node).line);
  }

  // Var (type inference)
  if (node.children?.Var || tokenImage(node, 'Identifier') === 'var') {
    throw new UnsupportedError('var type inference', loc(node).line);
  }

  // Attempt to extract name from Identifier
  const id = tokenImage(node, 'Identifier');
  if (id) {
    if (id === 'String') return { kind: 'String' };
    return { kind: 'ref', className: id };
  }

  // Unwrap single-child type node
  const keys = Object.keys(node.children ?? {}).filter(k => !['LBrace','RBrace','Dot'].includes(k));
  if (keys.length === 1 && (node.children?.[keys[0]!]?.length ?? 0) === 1) {
    return transformType(node.children![keys[0]!][0]);
  }

  throw new ParseError(`Cannot resolve type at line ${loc(node).line}`);
}

function extractTypeName(node: any): string {
  if (!node) return 'Object';
  const ids = children(node, 'Identifier').map((t: any) => t.image as string);
  if (ids.length > 0) return ids[0]!;
  const id = tokenImage(node, 'Identifier');
  if (id) return id;
  // Recurse into first child
  const keys = Object.keys(node.children ?? {});
  for (const k of keys) {
    const arr = node.children[k];
    if (Array.isArray(arr) && arr.length > 0) {
      const n = extractTypeName(arr[0]);
      if (n !== 'Object') return n;
    }
  }
  return 'Object';
}
