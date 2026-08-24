/**
 * Array CST Exploration - deep analysis of java-parser CST for array constructs
 * 
 * This file parses various array constructs and dumps their CST structures
 * to understand how java-parser represents:
 * - Array type declarations (int[], String[])
 * - Array creation (new int[5])
 * - Array literals ({1, 2, 3})
 * - Array access (arr[i])
 * - Enhanced for-each (for (T x : arr))
 * - Arrays in method parameters
 */

import { parse } from 'java-parser';

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

function getClassBodyDeclarations(cst: any): any[] {
  const ordinary = child(cst, 'ordinaryCompilationUnit');
  const typeDecl = children(ordinary, 'typeDeclaration')[0];
  const classDecl = child(typeDecl, 'classDeclaration');
  const normalClass = child(classDecl, 'normalClassDeclaration');
  const classBody = child(normalClass, 'classBody');
  return children(classBody, 'classBodyDeclaration');
}

function getMethodBlockStatement(cst: any, methodDeclIndex: number, statementIndex: number): any {
  const bodyDecls = getClassBodyDeclarations(cst);
  const member = child(bodyDecls[methodDeclIndex], 'classMemberDeclaration');
  const methodDecl = child(member, 'methodDeclaration');
  const methodBody = child(methodDecl, 'methodBody');
  const block = child(methodBody, 'block');
  const blockStatements = child(block, 'blockStatements');
  return children(blockStatements, 'blockStatement')[statementIndex];
}

function dumpCST(node: any, depth = 0, maxDepth = 12): void {
  if (depth > maxDepth) return;
  const indent = '  '.repeat(depth);
  
  if (!node) {
    console.log(`${indent}null`);
    return;
  }
  
  // Token (leaf node)
  if (node.image !== undefined) {
    console.log(`${indent}TOKEN: "${node.image}"`);
    return;
  }
  
  // Array of nodes
  if (Array.isArray(node)) {
    if (node.length === 0) {
      console.log(`${indent}[]`);
      return;
    }
    console.log(`${indent}[Array ${node.length}]:`);
    for (let i = 0; i < Math.min(node.length, 3); i++) {
      dumpCST(node[i], depth + 1, maxDepth);
    }
    if (node.length > 3) {
      console.log(`${indent}  ... (${node.length - 3} more items)`);
    }
    return;
  }
  
  // CST Node
  if (typeof node === 'object') {
    if (node.name) {
      console.log(`${indent}● ${node.name}`);
    }
    
    const childKeys = Object.keys(node.children ?? {});
    if (childKeys.length === 0) {
      console.log(`${indent}  (no children)`);
      return;
    }
    
    for (const key of childKeys) {
      const arr = node.children[key];
      if (!Array.isArray(arr)) continue;
      
      console.log(`${indent}  .${key}:`);
      if (arr.length === 0) {
        console.log(`${indent}    []`);
      } else {
        for (let i = 0; i < Math.min(arr.length, 2); i++) {
          dumpCST(arr[i], depth + 2, maxDepth);
        }
        if (arr.length > 2) {
          console.log(`${indent}    ... (${arr.length - 2} more)`);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Primitive Array Type Declaration
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 1: Primitive Array Type Declaration (int[] numbers;)     ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] numbers;
      }
    }
  `);
  
  const blockStmt = getMethodBlockStatement(cst, 0, 0);
  
  console.log('\n--- Full variable declaration statement ---');
  dumpCST(blockStmt);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Object Array Type Declaration
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 2: Object Array Type Declaration (String[] strings;)     ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      public static void main(String[] args) {
        String[] strings;
      }
    }
  `);
  
  const blockStmt = getMethodBlockStatement(cst, 0, 0);
  
  console.log('\n--- Full variable declaration statement ---');
  dumpCST(blockStmt);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: 2D Array Type Declaration
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 3: 2D Array Type Declaration (int[][] matrix;)          ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      public static void main(String[] args) {
        int[][] matrix;
      }
    }
  `);
  
  const blockStmt = getMethodBlockStatement(cst, 0, 0);
  
  console.log('\n--- Full variable declaration statement ---');
  dumpCST(blockStmt);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Array Creation (new int[5])
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 4: Array Creation (int[] arr = new int[5];)             ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = new int[5];
      }
    }
  `);
  
  const blockStmt = getMethodBlockStatement(cst, 0, 0);
  
  console.log('\n--- Full variable declaration with initialization ---');
  dumpCST(blockStmt);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Array Literal ({1, 2, 3})
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 5: Array Literal (int[] arr = {1, 2, 3};)              ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = {1, 2, 3};
      }
    }
  `);
  
  const blockStmt = getMethodBlockStatement(cst, 0, 0);
  
  console.log('\n--- Full variable declaration with array literal ---');
  dumpCST(blockStmt);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Array Access (arr[0])
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 6: Array Access (int x = arr[0];)                       ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = new int[5];
        int x = arr[0];
      }
    }
  `);
  
  const blockStmt = getMethodBlockStatement(cst, 0, 1);
  
  console.log('\n--- Full variable declaration with array access ---');
  dumpCST(blockStmt);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Array Assignment (arr[0] = 42)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 7: Array Assignment (arr[0] = 42;)                     ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = new int[5];
        arr[0] = 42;
      }
    }
  `);
  
  const blockStmt = getMethodBlockStatement(cst, 0, 1);
  
  console.log('\n--- Full expression statement with array assignment ---');
  dumpCST(blockStmt);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8: Array Length (arr.length)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 8: Array Length (int len = arr.length;)                ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = new int[5];
        int len = arr.length;
      }
    }
  `);
  
  const blockStmt = getMethodBlockStatement(cst, 0, 1);
  
  console.log('\n--- Full variable declaration with .length access ---');
  dumpCST(blockStmt);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9: Enhanced For-Each (for (int x : arr))
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 9: Enhanced For-Each (for (int x : arr) { ... })       ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = {1, 2, 3};
        for (int x : arr) {
          System.out.println(x);
        }
      }
    }
  `);
  
  const blockStmt = getMethodBlockStatement(cst, 0, 1);
  
  console.log('\n--- Full enhanced for-each statement ---');
  dumpCST(blockStmt);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 10: Array as Method Parameter
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 10: Array as Method Parameter (void printArray(int[] arr)) ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      void printArray(int[] arr) {
        System.out.println(arr.length);
      }
    }
  `);
  
  const bodyDecls = getClassBodyDeclarations(cst);
  const methodDecl = bodyDecls[0];

  console.log('\n--- Full method declaration with array parameter ---');
  dumpCST(methodDecl);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 11: Array Field in Class (class with array field)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ TEST 11: Array Field in Class (int[] values;)                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

try {
  const cst = parse(`
    public class Test {
      int[] values;
    }
  `);
  
  const bodyDecls = getClassBodyDeclarations(cst);
  const fieldDecl = bodyDecls[0];
  
  console.log('\n--- Full field declaration with array type ---');
  dumpCST(fieldDecl);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ Array CST Exploration Complete                               ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('\nNext steps:');
console.log('1. Review CST output above');
console.log('2. Identify key node types for array constructs');
console.log('3. Document patterns in jvm-visualizer repo memory');
console.log('4. Update AST contract in types.ts');
console.log('5. Implement parser.ts array transformations');
console.log('6. Implement interpreter.ts array semantics\n');
