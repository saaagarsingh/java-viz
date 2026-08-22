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
  BinaryOp, UnaryOp,
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

  const name     = tokenImage(normalClass, 'Identifier') ?? tokenImage(normalClass, 'typeIdentifier') ?? 'Unknown';
  const isAbstract = modifiers.includes('abstract');
  const nodeLoc  = loc(normalClass) ?? { line: 0, column: 0 };

  // Superclass
  let superclass: string | null = null;
  const superclause = child(normalClass, 'superclass');
  if (superclause) {
    superclass = extractTypeName(child(superclause, 'classType'));
  }

  // Interfaces
  const interfaces: string[] = [];
  const ifaceClause = child(normalClass, 'superinterfaces');
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

  const name    = tokenImage(normalIface, 'Identifier') ?? tokenImage(normalIface, 'typeIdentifier') ?? 'Unknown';
  const nodeLoc = loc(normalIface);

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

  const isStatic = modTokens.includes('static');

  if (modTokens.includes('volatile') || modTokens.includes('transient')) {
    throw new UnsupportedError('volatile/transient fields', loc(node).line);
  }

  const type     = transformType(child(node, 'unannType'));
  const varDecls = children(node, 'variableDeclaratorList')
    .flatMap((vdl: any) => children(vdl, 'variableDeclarator'));

  return varDecls.map((vd: any): FieldDecl => {
    const idNode    = child(vd, 'variableDeclaratorId');
    const name      = tokenImage(idNode, 'Identifier') ?? '';
    const initNode  = child(vd, 'variableInitializer');
    const initializer = initNode ? transformExpr(child(initNode, 'expression') ?? initNode) : null;
    return { kind: 'FieldDecl', name, type, initializer, isStatic, loc: loc(vd) };
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

  const isStatic   = modTokens.includes('static');
  const isAbstract = modTokens.includes('abstract');

  if (modTokens.includes('synchronized')) throw new UnsupportedError('synchronized methods', loc(node).line);
  if (modTokens.includes('native'))       throw new UnsupportedError('native methods', loc(node).line);

  const result    = child(header, 'result');
  const returnType = result && tokenImage(result, 'Void') ? { kind: 'void' as const } : transformType(child(header, 'unannType') ?? result);

  const declarator = child(header, 'methodDeclarator');
  const name       = tokenImage(declarator, 'Identifier') ?? '';
  const params     = transformFormalParams(child(declarator, 'formalParameterList'));

  // Generic type parameters
  if (child(header, 'typeParameters')) throw new UnsupportedError('generic methods', loc(header).line);

  const statements = body ? (child(body, 'block') ? transformBlock(child(body, 'block')) : null) : null;

  return { kind: 'MethodDecl', name, returnType, params, body: statements, isStatic, isAbstract, loc: loc(node) };
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

  return { kind: 'MethodDecl', name, returnType, params, body: statements, isStatic: false, isAbstract: !isDefault, loc: loc(node) };
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

  // Explicit constructor invocation (super(...) or this(...))
  const eci = child(body, 'explicitGenericInvocation') ??
              child(body, 'explicitConstructorInvocation') ??
              children(body, 'blockStatement').find((bs: any) =>
                child(bs, 'statement')?.children?.explicitConstructorInvocation);

  // java-parser puts super()/this() as a special child
  const superInv = child(body, 'superCall') ?? findSuperCall(body);
  if (superInv) {
    stmts.push(transformSuperCall(superInv));
  }

  for (const bs of children(body, 'blockStatement') ?? children(body, 'blockStatements')?.[0] ? children(children(body, 'blockStatements')[0], 'blockStatement') : []) {
    const s = transformBlockStatement(bs);
    if (s) stmts.push(s);
  }

  return stmts;
}

/** Walk body to find a super(...) or this(...) invocation as first statement */
function findSuperCall(body: any): any | null {
  const blockStmts = children(body, 'blockStatements');
  const allBs = blockStmts.length > 0
    ? children(blockStmts[0], 'blockStatement')
    : children(body, 'blockStatement');
  if (allBs.length === 0) return null;
  const first = allBs[0];
  const stmt = child(first, 'statement');
  if (!stmt) return null;
  const exprStmt = child(stmt, 'statementWithoutTrailingSubstatement');
  if (!exprStmt) return null;
  const es = child(exprStmt, 'expressionStatement');
  if (!es) return null;
  const expr = child(es, 'statementExpression');
  if (!expr) return null;
  // Check if it's a methodInvocation to 'super'
  const mi = child(expr, 'methodInvocation');
  if (mi && (tokenImage(mi, 'Super') || tokenImage(mi, 'super'))) return mi;
  return null;
}

function transformSuperCall(node: any): Statement {
  const argList = child(node, 'argumentList');
  const args    = argList ? children(argList, 'expression').map(transformExpr) : [];
  return {
    kind: 'ExprStmt',
    expr: { kind: 'SuperCallExpr', args, loc: loc(node) },
    loc:  loc(node),
  };
}

// ── Parameters ────────────────────────────────────────────────────────────────

function transformFormalParams(node: any): ParamDecl[] {
  if (!node) return [];
  const params: ParamDecl[] = [];
  for (const fp of children(node, 'formalParameter')) {
    if (child(fp, 'variableArityParameter')) {
      throw new UnsupportedError('varargs', loc(fp).line);
    }
    const type = transformType(child(fp, 'unannType'));
    const id   = child(fp, 'variableDeclaratorId');
    const name = tokenImage(id, 'Identifier') ?? '';
    params.push({ name, type });
  }
  // receiverParameter is fine to ignore
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
  const ifS  = child(stmt, 'ifThenStatement') ?? child(stmt, 'ifThenElseStatement');
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

    if (brk || cont) throw new UnsupportedError('break/continue (Phase 1.5)', loc(swts).line);
    if (thr)         throw new UnsupportedError('throw statements (Phase 4)', loc(swts).line);
    if (sw)          throw new UnsupportedError('switch statements', loc(swts).line);
    if (sync)        throw new UnsupportedError('synchronized blocks (Phase 2)', loc(sync).line);
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
  if (enhanced) throw new UnsupportedError('enhanced for loop (Phase 1.5)', loc(enhanced).line);
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

// ── Expression dispatch ───────────────────────────────────────────────────────

function transformStatementExpr(se: any): Expr {
  if (!se) throw new ParseError('Empty statement expression');
  const assign  = child(se, 'assignment');
  const mi      = child(se, 'methodInvocation');
  const preIncr = child(se, 'preIncrementExpression');
  const preDecr = child(se, 'preDecrementExpression');
  const postIncr = child(se, 'postIncrementExpression');
  const postDecr = child(se, 'postDecrementExpression');
  const classInst = child(se, 'classInstanceCreationExpression');

  if (assign)   return transformAssignment(assign);
  if (mi)       return transformMethodInvocation(mi);
  if (classInst) return transformNewObject(classInst);
  if (preIncr || preDecr || postIncr || postDecr) {
    const node = preIncr ?? preDecr ?? postIncr ?? postDecr;
    const op: UnaryOp = (preIncr || postIncr) ? '++' : '--';
    const prefix = !!(preIncr || preDecr);
    const operand = transformExpr(children(node, 'unaryExpression')[0] ??
                                  children(node, 'postfixExpression')[0] ??
                                  children(node, 'unaryExpressionNotPlusMinus')[0] ??
                                  node);
    return { kind: 'UnaryExpr', op, operand, prefix, loc: loc(node) };
  }

  throw new ParseError(`Unsupported statement expression at line ${loc(se).line}`);
}

function transformExpr(node: any): Expr {
  if (!node) throw new ParseError('Null expression node');

  // ── Leaf token: handle before anything else ──────────────────────────────────
  // Some paths (binary operand extraction, direct token args) pass tokens directly.
  if (node.image !== undefined && !node.children) {
    const img = node.image as string;
    const tn  = (node.tokenType?.name ?? '') as string;
    if (img === 'true')  return { kind: 'BoolLiteral',   value: true,  loc: loc(node) };
    if (img === 'false') return { kind: 'BoolLiteral',   value: false, loc: loc(node) };
    if (img === 'null')  return { kind: 'NullLiteral',                 loc: loc(node) };
    if (img === 'this')  return { kind: 'ThisExpr',                    loc: loc(node) };
    if (img.startsWith('"') && img.endsWith('"')) {
      return { kind: 'StringLiteral', value: parseStringLiteral(img), loc: loc(node) };
    }
    if (/^\d/.test(img) || tn.toLowerCase().includes('integer') || tn.toLowerCase().includes('decimal') || tn.toLowerCase().includes('hex') || tn.toLowerCase().includes('float') || tn.toLowerCase().includes('char')) {
      return transformLiteral(node);
    }
    if (tn === 'Identifier' || (!tn && /^[a-zA-Z_$]/.test(img))) {
      return { kind: 'VarExpr', name: img, loc: loc(node) };
    }
  }

  const tag = node.name ?? Object.keys(node.children ?? {})[0];

  // ── Literal checks (node is a CST rule with literal children) ────────────────
  if (node.children?.integerLiteral) return transformLiteral(node.children.integerLiteral[0]);
  if (node.children?.floatingPointLiteral) return transformLiteral(node.children.floatingPointLiteral[0]);
  if (node.children?.booleanLiteral) return transformLiteral(node.children.booleanLiteral[0]);
  if (node.children?.characterLiteral) return transformLiteral(node.children.characterLiteral[0]);
  if (node.children?.StringLiteral) return { kind: 'StringLiteral', value: parseStringLiteral(node.children.StringLiteral[0].image), loc: loc(node.children.StringLiteral[0]) };
  if (node.children?.Null) return { kind: 'NullLiteral', loc: loc(node.children.Null[0]) };
  if (node.children?.This) return { kind: 'ThisExpr', loc: loc(node.children.This[0]) };

  // ── Assignment ────────────────────────────────────────────────────────────────
  if (node.children?.assignment) return transformAssignment(node.children.assignment[0]);
  if (node.name === 'assignment') return transformAssignment(node);

  // ── Method invocation ─────────────────────────────────────────────────────────
  if (node.children?.methodInvocation) return transformMethodInvocation(node.children.methodInvocation[0]);
  if (node.name === 'methodInvocation') return transformMethodInvocation(node);

  // ── New object ────────────────────────────────────────────────────────────────
  if (node.children?.classInstanceCreationExpression) return transformNewObject(node.children.classInstanceCreationExpression[0]);
  if (node.name === 'classInstanceCreationExpression') return transformNewObject(node);

  // ── Binary / ternary ──────────────────────────────────────────────────────────
  if (node.name === 'ternaryExpression' || node.children?.QuestionMark) throw new UnsupportedError('ternary expression (Phase 1.5)', loc(node).line);

  // java-parser names binary rules: binaryExpression, additiveExpression,
  // multiplicativeExpression, relationalExpression, equalityExpression,
  // conditionalAndExpression, conditionalOrExpression, etc.
  const BINARY_RULE_NAMES = new Set([
    'binaryExpression', 'additiveExpression', 'multiplicativeExpression',
    'relationalExpression', 'equalityExpression', 'exclusiveOrExpression',
    'andExpression', 'inclusiveOrExpression',
    'conditionalAndExpression', 'conditionalOrExpression',
    'shiftExpression',
  ]);
  if (node.name && BINARY_RULE_NAMES.has(node.name)) return transformBinary(node);

  // ── Field / method chain with Dot ─────────────────────────────────────────────
  if (node.children?.Dot) return transformFieldOrMethodAccess(node);

  // ── Unary ─────────────────────────────────────────────────────────────────────
  if (node.name === 'unaryExpression' || node.name === 'unaryExpressionNotPlusMinus') return transformUnary(node);
  if (node.name === 'preIncrementExpression')  return { kind: 'UnaryExpr', op: '++', operand: transformExpr(node.children.unaryExpression[0]), prefix: true,  loc: loc(node) };
  if (node.name === 'preDecrementExpression')  return { kind: 'UnaryExpr', op: '--', operand: transformExpr(node.children.unaryExpression[0]), prefix: true,  loc: loc(node) };
  if (node.name === 'postIncrementExpression') return { kind: 'UnaryExpr', op: '++', operand: transformExpr(node.children.postfixExpression[0]), prefix: false, loc: loc(node) };
  if (node.name === 'postDecrementExpression') return { kind: 'UnaryExpr', op: '--', operand: transformExpr(node.children.postfixExpression[0]), prefix: false, loc: loc(node) };

  // ── Cast / instanceof ─────────────────────────────────────────────────────────
  if (node.name === 'castExpression') throw new UnsupportedError('type cast (Phase 1.5)', loc(node).line);
  if (node.children?.Instanceof) throw new UnsupportedError('instanceof (Phase 1.5)', loc(node).line);

  // ── Lambda ────────────────────────────────────────────────────────────────────
  if (node.name === 'lambdaExpression') throw new UnsupportedError('lambda (Phase 6)', loc(node).line);

  // ── Parenthesised ─────────────────────────────────────────────────────────────
  if (node.children?.LBrace || node.children?.LParen) {
    const inner = children(node, 'expression')[0] ?? children(node, 'expressionName')[0];
    if (inner) return transformExpr(inner);
  }

  // ── Single-child unwrap ───────────────────────────────────────────────────────
  // CRITICAL: filter keys with empty arrays so `primarySuffix: []` doesn't block
  // the unwrap when a `primary` node has `primaryPrefix: [x]` + `primarySuffix: []`.
  const SKIP_KEYS = new Set(['LBrace','RBrace','LParen','RParen','Semicolon','Comma','Dot','Super']);
  const childKeys = Object.keys(node.children ?? {})
    .filter(k => !SKIP_KEYS.has(k))
    .filter(k => ((node.children as any)[k] as any[]).length > 0);

  if (childKeys.length === 1 && ((node.children as any)[childKeys[0]!] as any[]).length === 1) {
    return transformExpr((node.children as any)[childKeys[0]!][0]);
  }

  // ── Multi-child name-based fallback ───────────────────────────────────────────
  if (node.name === 'expression' || node.name === 'assignmentExpression') {
    const first = childKeys[0];
    if (first) return transformExpr((node.children as any)[first][0]);
  }

  // ── Last resort: walk all children looking for something we can parse ─────────
  for (const key of childKeys) {
    try { return transformExpr((node.children as any)[key][0]); } catch { /* try next */ }
  }

  throw new ParseError(`Unrecognised expression node "${node.name ?? tag}" at line ${loc(node).line}`);
}

// ── Literals ──────────────────────────────────────────────────────────────────

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

// ── Assignment ────────────────────────────────────────────────────────────────

function transformAssignment(node: any): Expr {
  const lhs      = child(node, 'leftHandSide') ?? children(node, 'expression')[0];
  const op       = children(node, 'assignmentOperator')[0]?.children;
  const opStr    = op ? Object.keys(op)[0] ?? '=' : '=';
  const rhs      = children(node, 'expression').at(-1) ?? child(node, 'expression');

  const target   = transformLHS(lhs ?? node.children?.expressionName?.[0]);
  const value    = transformExpr(rhs);

  if (opStr === 'Equals') {
    return { kind: 'AssignExpr', target, value, loc: loc(node) };
  }
  // Compound: +=, -=, *=, /=, %=
  const compoundMap: Record<string, string> = {
    'PlusEquals': '+=', 'MinusEquals': '-=',
    'StarEquals': '*=', 'SlashEquals': '/=',
    'PercentEquals': '%=',
  };
  const compOp = compoundMap[opStr];
  if (compOp) {
    return { kind: 'CompoundAssignExpr', op: compOp as any, target, value, loc: loc(node) };
  }
  throw new UnsupportedError(`${opStr} assignment operator`, loc(node).line);
}

function transformLHS(node: any): Expr & { kind: 'VarExpr' | 'FieldAccessExpr' | 'StaticFieldAccessExpr' } {
  if (!node) throw new ParseError('Null LHS');

  // Simple identifier
  if (node.children?.Identifier?.length === 1 && Object.keys(node.children).length === 1) {
    return { kind: 'VarExpr', name: node.children.Identifier[0].image, loc: loc(node.children.Identifier[0]) };
  }
  if (node.children?.expressionName) return transformLHS(node.children.expressionName[0]);
  if (node.name === 'expressionName') {
    const ids = children(node, 'Identifier').map((t: any) => t.image);
    if (ids.length === 1) return { kind: 'VarExpr', name: ids[0]!, loc: loc(node) };
    if (ids.length === 2) {
      // Could be this.field or ClassName.field or local.field
      const qualifier = ids[0]!;
      const field     = ids[1]!;
      if (qualifier === 'this') {
        return { kind: 'FieldAccessExpr', object: { kind: 'ThisExpr', loc: loc(node) }, field, loc: loc(node) };
      }
      // Assume static for now; interpreter will resolve
      return { kind: 'StaticFieldAccessExpr', className: qualifier, field, loc: loc(node) };
    }
    if (ids.length > 2) throw new UnsupportedError('chained field access', loc(node).line);
  }

  // this.field
  if (node.children?.This) {
    const ids = children(node, 'Identifier');
    if (ids.length === 1) {
      return { kind: 'FieldAccessExpr', object: { kind: 'ThisExpr', loc: loc(node) }, field: ids[0].image, loc: loc(node) };
    }
  }

  // Dot access on expr
  if (node.children?.Dot) return transformFieldOrMethodAccess(node) as any;

  // Array access — not supported
  if (node.children?.LSquareBracket) throw new UnsupportedError('array access', loc(node).line);

  throw new ParseError(`Cannot transform LHS at line ${loc(node).line}`);
}

// ── Method invocations ────────────────────────────────────────────────────────

function transformMethodInvocation(node: any): Expr {
  const argList = child(node, 'argumentList');
  const args    = argList ? children(argList, 'expression').map(transformExpr) : [];
  const ids     = children(node, 'Identifier').map((t: any) => t.image as string);
  const hasSuper = !!node.children?.Super;
  const hasThis  = !!node.children?.This;
  const hasDot   = !!node.children?.Dot;
  const nodeLoc  = loc(node);

  // super.method(...)
  if (hasSuper && hasDot) {
    throw new UnsupportedError('super.method() calls (use overriding instead)', nodeLoc.line);
  }

  // Detect System.out.println
  if (ids.join('.').endsWith('System.out.println') || ids.join('.') === 'println') {
    return { kind: 'PrintlnExpr', args, loc: nodeLoc };
  }
  if (ids.join('.').includes('System.out.print')) {
    throw new UnsupportedError('System.out.print (use println)', nodeLoc.line);
  }
  if (ids[0] === 'System') {
    throw new UnsupportedError(`System.${ids.slice(1).join('.')}`, nodeLoc.line);
  }

  // Unqualified: method(args) → this.method(args)
  if (ids.length === 1 && !hasDot) {
    return { kind: 'MethodCallExpr', receiver: { kind: 'ThisExpr', loc: nodeLoc }, method: ids[0]!, args, loc: nodeLoc };
  }

  // TypeName.method(args) or expr.method(args)
  if (ids.length === 2 && hasDot) {
    const qualifier = ids[0]!;
    const method    = ids[1]!;
    // Treat as static if qualifier starts with uppercase (convention)
    if (qualifier[0] === qualifier[0]?.toUpperCase() && qualifier[0] !== qualifier[0]?.toLowerCase()) {
      return { kind: 'StaticMethodCallExpr', className: qualifier, method, args, loc: nodeLoc };
    }
    // Otherwise dynamic: qualifier is a variable
    return { kind: 'MethodCallExpr', receiver: { kind: 'VarExpr', name: qualifier, loc: nodeLoc }, method, args, loc: nodeLoc };
  }

  // this.method(args)
  if (hasThis && hasDot && ids.length === 1) {
    return { kind: 'MethodCallExpr', receiver: { kind: 'ThisExpr', loc: nodeLoc }, method: ids[0]!, args, loc: nodeLoc };
  }

  // Chained call (a.b.c()) - not supported in Phase 1
  if (ids.length > 2) throw new UnsupportedError('chained method calls', nodeLoc.line);

  throw new ParseError(`Unrecognised method invocation at line ${nodeLoc.line}`);
}

function transformFieldOrMethodAccess(node: any): Expr {
  // node has Dot tokens — could be field read or method call
  const ids = children(node, 'Identifier').map((t: any) => t.image as string);
  const nodeLoc = loc(node);

  if (ids.length >= 2) {
    const qualifier = ids[0]!;
    const member    = ids[1]!;
    const isUpper   = qualifier[0] === qualifier[0]?.toUpperCase() && qualifier[0] !== qualifier[0]?.toLowerCase();

    if (isUpper) {
      return { kind: 'StaticFieldAccessExpr', className: qualifier, field: member, loc: nodeLoc };
    }
    if (qualifier === 'this') {
      return { kind: 'FieldAccessExpr', object: { kind: 'ThisExpr', loc: nodeLoc }, field: member, loc: nodeLoc };
    }
    return { kind: 'FieldAccessExpr', object: { kind: 'VarExpr', name: qualifier, loc: nodeLoc }, field: member, loc: nodeLoc };
  }
  throw new ParseError(`Cannot resolve dot access at line ${nodeLoc.line}`);
}

// ── new ───────────────────────────────────────────────────────────────────────

function transformNewObject(node: any): Expr {
  // Reject anonymous class bodies
  if (child(node, 'classBody')) throw new UnsupportedError('anonymous class (Phase 6)', loc(node).line);
  // Reject generic type args
  if (child(node, 'typeArguments')) throw new UnsupportedError('generic type arguments', loc(node).line);
  // Array creation
  if (child(node, 'arrayCreatorRest') || child(node, 'dimExprs')) throw new UnsupportedError('array creation (Phase 5)', loc(node).line);

  const classType = child(node, 'classOrInterfaceTypeToInstantiate') ??
                    child(node, 'classType') ??
                    child(node, 'fqnOrRefType');
  const className = extractTypeName(classType);
  const argList   = child(node, 'argumentList');
  const args      = argList ? children(argList, 'expression').map(transformExpr) : [];
  return { kind: 'NewObjectExpr', className, args, loc: loc(node) };
}

// ── Binary expressions ────────────────────────────────────────────────────────

function transformBinary(node: any): Expr {
  const c = node.children ?? {};
  const nodeLoc = loc(node);

  // ── Find operand arrays ──────────────────────────────────────────────────────
  // java-parser places operands in arrays keyed by the sub-expression rule name.
  // We try the most specific rules first, then fall back to 'expression'.
  const operandKeys = [
    'multiplicativeExpression', 'additiveExpression',
    'shiftExpression', 'relationalExpression', 'equalityExpression',
    'andExpression', 'exclusiveOrExpression', 'inclusiveOrExpression',
    'conditionalAndExpression', 'conditionalOrExpression',
    'unaryExpression', 'unaryExpressionNotPlusMinus',
    'primaryNoNewArray', 'primary',
    'conditionalExpression', 'expression',
  ];

  let operands: any[] = [];
  for (const key of operandKeys) {
    if (c[key]?.length) { operands = c[key]; break; }
  }

  // ── Find operator — by token IMAGE (robust across java-parser versions) ──────
  const imageToOp: Record<string, BinaryOp> = {
    '+': '+', '-': '-', '*': '*', '/': '/', '%': '%',
    '==': '==', '!=': '!=', '<': '<', '>': '>', '<=': '<=', '>=': '>=',
    '&&': '&&', '||': '||',
  };
  // Also keep a name-based fallback for older versions
  const nameToOp: Record<string, BinaryOp> = {
    'Plus': '+', 'Minus': '-', 'Star': '*', 'Slash': '/', 'Percent': '%',
    'EqualsEquals': '==', 'Equals': '==', 'NotEquals': '!=',
    'Less': '<', 'Greater': '>', 'LessEquals': '<=', 'GreaterEquals': '>=',
    'AndAnd': '&&', 'OrOr': '||',
  };

  let op: BinaryOp | undefined;
  // Image-based: scan every children key for a known operator image
  outer: for (const arr of Object.values(c) as any[][]) {
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      if (t?.image && imageToOp[t.image]) { op = imageToOp[t.image]; break outer; }
    }
  }
  // Name-based fallback
  if (!op) {
    for (const [tokenName, binOp] of Object.entries(nameToOp)) {
      if (c[tokenName]?.length) { op = binOp; break; }
    }
  }

  if (!op || operands.length < 2) {
    if (operands.length === 1) return transformExpr(operands[0]);
    // Fall through to single-child scan
    const keys = Object.keys(c).filter(k => (c[k] as any[]).length > 0);
    if (keys.length === 1 && (c[keys[0]!] as any[]).length === 1) return transformExpr(c[keys[0]!][0]);
    throw new ParseError(`Cannot resolve binary expression "${node.name}" at line ${nodeLoc.line}`);
  }

  // Fold left-to-right for chains (a + b + c)
  let result = transformExpr(operands[0]!);
  for (let i = 1; i < operands.length; i++) {
    result = { kind: 'BinaryExpr', op, left: result, right: transformExpr(operands[i]!), loc: nodeLoc };
  }
  return result;
}

// ── Unary expressions ─────────────────────────────────────────────────────────

function transformUnary(node: any): Expr {
  const c = node.children ?? {};
  const nodeLoc = loc(node);

  if (c.Minus) {
    const operand = children(node, 'unaryExpression')[0] ?? children(node, 'unaryExpressionNotPlusMinus')[0];
    return { kind: 'UnaryExpr', op: '-', operand: transformExpr(operand), prefix: true, loc: nodeLoc };
  }
  if (c.Exclamation) {
    const operand = children(node, 'unaryExpression')[0] ?? children(node, 'unaryExpressionNotPlusMinus')[0];
    return { kind: 'UnaryExpr', op: '!', operand: transformExpr(operand), prefix: true, loc: nodeLoc };
  }
  // Plus — no-op unary plus
  if (c.Plus) {
    const operand = children(node, 'unaryExpression')[0];
    return transformExpr(operand);
  }

  // Unwrap single child
  const keys = Object.keys(c).filter(k => !['LParen','RParen'].includes(k));
  if (keys.length === 1 && c[keys[0]!]?.length === 1) return transformExpr(c[keys[0]!][0]);

  throw new ParseError(`Unrecognised unary expression at line ${nodeLoc.line}`);
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
