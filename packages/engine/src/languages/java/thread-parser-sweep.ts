import { parseJava } from './parser.js';
import type { Expr, Program, Statement } from './ast.js';

interface CaseDef {
  id: string;
  title: string;
  source: string;
}

const CASES: CaseDef[] = [
  {
    id: 'P1',
    title: 'Synchronized instance method',
    source: `
class Counter {
  int count = 0;
  synchronized void inc() { count++; }
}
class Main {
  static void main() { Counter c = new Counter(); c.inc(); }
}
`,
  },
  {
    id: 'P2',
    title: 'Synchronized block on this',
    source: `
class Counter {
  int count = 0;
  void inc() {
    synchronized (this) {
      count = count + 1;
    }
  }
}
class Main {
  static void main() { Counter c = new Counter(); c.inc(); }
}
`,
  },
  {
    id: 'P3',
    title: 'Volatile field read/write',
    source: `
class Flag {
  volatile int ready = 0;
  void setReady() { ready = 1; }
  int getReady() { return ready; }
}
class Main {
  static void main() { Flag f = new Flag(); f.setReady(); System.out.println(f.getReady()); }
}
`,
  },
  {
    id: 'P4',
    title: 'DSL thread directives with shared monitor',
    source: `
class Counter {
  int count = 0;
  synchronized void inc() { count++; }
}
class Main {
  static void main() {
    Counter c = new Counter();
    // @thread "Worker-1" { run: c.inc() }
    // @thread "Worker-2" { run: c.inc() }
    c.inc();
  }
}
`,
  },
  {
    id: 'P5',
    title: 'Reentrant synchronized path',
    source: `
class Box {
  int v = 0;
  synchronized void outer() { inner(); }
  synchronized void inner() { v++; }
}
class Main {
  static void main() { Box b = new Box(); b.outer(); }
}
`,
  },
  {
    id: 'P6',
    title: 'Thread allocation and start call',
    source: `
class Main {
  static void main() {
    Thread t = new Thread();
    t.start();
  }
}
`,
  },
  {
    id: 'P7',
    title: 'Static Thread.sleep call',
    source: `
class Main {
  static void main() {
    Thread.sleep(10);
  }
}
`,
  },
  {
    id: 'P8',
    title: 'Thread join call',
    source: `
class Main {
  static void main() {
    Thread t = new Thread();
    t.start();
    t.join();
  }
}
`,
  },
  {
    id: 'P9',
    title: 'Anonymous Runnable (expected unsupported)',
    source: `
class Main {
  static void main() {
    Thread t = new Thread(new Runnable() {
      public void run() {
        System.out.println(1);
      }
    });
    t.start();
  }
}
`,
  },
  {
    id: 'P10',
    title: 'Lambda Runnable (expected unsupported)',
    source: `
class Main {
  static void main() {
    Runnable r = () -> { System.out.println(1); };
    Thread t = new Thread(r);
    t.start();
  }
}
`,
  },
];

function summarizeExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'VarExpr':
      return `Var(${expr.name})`;
    case 'ThisExpr':
      return 'This';
    case 'MethodCallExpr':
      return `Call(${summarizeExpr(expr.receiver)}.${expr.method}/${expr.args.length})`;
    case 'StaticMethodCallExpr':
      return `StaticCall(${expr.className}.${expr.method}/${expr.args.length})`;
    case 'FieldAccessExpr':
      return `Field(${summarizeExpr(expr.object)}.${expr.field})`;
    case 'StaticFieldAccessExpr':
      return `StaticField(${expr.className}.${expr.field})`;
    case 'NewObjectExpr':
      return `New(${expr.className}/${expr.args.length})`;
    case 'AssignExpr':
      return `Assign(${summarizeExpr(expr.target)} = ${summarizeExpr(expr.value)})`;
    case 'CompoundAssignExpr':
      return `CompAssign(${expr.op})`;
    case 'BinaryExpr':
      return `Binary(${expr.op})`;
    case 'UnaryExpr':
      return `Unary(${expr.op}, prefix=${expr.prefix})`;
    case 'PrintlnExpr':
      return `Println(${expr.args.length})`;
    case 'TernaryExpr':
      return 'Ternary';
    case 'InstanceofExpr':
      return `Instanceof(${expr.className})`;
    case 'IntLiteral':
      return `Int(${expr.value})`;
    case 'LongLiteral':
      return `Long(${expr.value})`;
    case 'DoubleLiteral':
      return `Double(${expr.value})`;
    case 'BoolLiteral':
      return `Bool(${expr.value})`;
    case 'CharLiteral':
      return `Char(${JSON.stringify(expr.value)})`;
    case 'StringLiteral':
      return `String(${JSON.stringify(expr.value)})`;
    case 'NullLiteral':
      return 'Null';
    case 'SuperCallExpr':
      return `SuperCall(${expr.args.length})`;
  }
  return 'Expr(unknown)';
}

function summarizeStmt(stmt: Statement): string {
  switch (stmt.kind) {
    case 'LocalVarDecl':
      return `LocalVar(${stmt.type.kind} ${stmt.name}${stmt.initializer ? ` = ${summarizeExpr(stmt.initializer)}` : ''})`;
    case 'ExprStmt':
      return `Expr(${summarizeExpr(stmt.expr)})`;
    case 'ReturnStmt':
      return `Return(${stmt.value ? summarizeExpr(stmt.value) : 'void'})`;
    case 'IfStmt':
      return `If(${summarizeExpr(stmt.condition)})`;
    case 'ForStmt':
      return 'For';
    case 'WhileStmt':
      return `While(${summarizeExpr(stmt.condition)})`;
    case 'BreakStmt':
      return 'Break';
    case 'ContinueStmt':
      return 'Continue';
    case 'BlockStmt':
      return `Block(${stmt.statements.length})`;
    case 'SynchronizedStmt':
      return `Synchronized(${summarizeExpr(stmt.expr)})`;
  }
  return 'Stmt(unknown)';
}

function summarizeProgram(program: Program): string {
  const out: string[] = [];

  for (const cls of program.classes) {
    out.push(`class ${cls.name}${cls.superclass ? ` extends ${cls.superclass}` : ''} ${cls.isInterface ? '[interface]' : ''}`.trim());

    for (const f of cls.fields) {
      out.push(`  field ${f.type.kind} ${f.name} static=${f.isStatic} volatile=${f.isVolatile}`);
    }

    for (const m of cls.methods) {
      out.push(`  method ${m.name} static=${m.isStatic} sync=${m.isSynchronized} abstract=${m.isAbstract}`);
      if (m.body) {
        for (const stmt of m.body) {
          out.push(`    - ${summarizeStmt(stmt)}`);
        }
      }
    }
  }

  return out.join('\n');
}

function runCase(c: CaseDef) {
  console.log(`\n=== ${c.id}: ${c.title} ===`);
  try {
    const ast = parseJava(c.source);
    console.log('PARSE: OK');
    console.log(summarizeProgram(ast));
  } catch (error) {
    const e = error as { name?: string; message?: string; line?: number | null; feature?: string };
    console.log('PARSE: FAIL');
    console.log(`error.name=${e.name ?? 'UnknownError'}`);
    console.log(`error.line=${e.line ?? 'n/a'}`);
    console.log(`error.feature=${e.feature ?? 'n/a'}`);
    console.log(`error.message=${e.message ?? String(error)}`);
  }
}

function main() {
  if (CASES.length !== 10) {
    throw new Error(`Expected exactly 10 parser cases, found ${CASES.length}`);
  }
  console.log(`Running parser sweep with ${CASES.length} cases...`);
  for (const c of CASES) runCase(c);
}

main();
