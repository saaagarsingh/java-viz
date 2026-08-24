/**
 * Comprehensive array construct exploration for java-parser
 * 
 * This file analyzes how java-parser CST handles:
 * 1. Array type declarations (primitives & objects)
 * 2. Array creation (new T[], literal initialization)
 * 3. Array access and assignment (arr[i], arr[i] = value)
 * 4. Array length (.length property)
 * 5. Enhanced for-each loops (for (T x : arr))
 * 6. Arrays as method parameters and return types
 * 
 * STRATEGY: Parse each construct, inspect CST, document structure
 */

import { parse } from 'java-parser';
import * as util from 'util';

// Helper to navigate CST
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

function fullText(node: any): string {
  if (node?.image !== undefined) return node.image;
  const acc: string[] = [];
  function walk(n: any) {
    if (!n) return;
    if (n.image !== undefined) {
      acc.push(n.image);
      return;
    }
    const kids = n.children ?? {};
    for (const key of Object.keys(kids)) {
      const arr = kids[key];
      if (Array.isArray(arr)) {
        for (const cn of arr) walk(cn);
      }
    }
  }
  walk(node);
  return acc.join('');
}

// Pretty print a CST node with limited depth
function dumpCST(node: any, depth = 0, maxDepth = 4): void {
  if (depth > maxDepth) return;
  const indent = '  '.repeat(depth);
  
  if (!node) {
    console.log(`${indent}null`);
    return;
  }
  
  if (node.image !== undefined) {
    console.log(`${indent}TOKEN: "${node.image}"`);
    return;
  }
  
  if (Array.isArray(node)) {
    console.log(`${indent}[Array ${node.length}]`);
    for (let i = 0; i < Math.min(node.length, 2); i++) {
      dumpCST(node[i], depth + 1, maxDepth);
    }
    if (node.length > 2) console.log(`${indent}  ... (+${node.length - 2})`);
    return;
  }
  
  if (typeof node === 'object') {
    if (node.name) console.log(`${indent}@${node.name}`);
    
    const childKeys = Object.keys(node.children ?? {});
    for (const key of childKeys.slice(0, 8)) {
      const arr = node.children[key];
      if (!Array.isArray(arr)) continue;
      console.log(`${indent}  .${key}:`);
      for (let i = 0; i < Math.min(arr.length, 2); i++) {
        dumpCST(arr[i], depth + 2, maxDepth);
      }
      if (arr.length > 2) console.log(`${indent}    ... (+${arr.length - 2})`);
    }
    if (childKeys.length > 8) console.log(`${indent}  ... (+${childKeys.length - 8} more keys)`);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Primitive Array Type Declaration
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 1: Primitive Array Type Declaration ==========');
console.log('Code: int[] numbers;');

try {
  const cst1 = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] numbers;
      }
    }
  `);
  
  const compilationUnit = cst1.children.compilationUnit[0];
  const classDecl = compilationUnit.children.typeDeclaration[0];
  const methodDecl = classDecl.children.classBody[0].children.classBodyDeclaration[0];
  const methodBody = methodDecl.children.methodBody[0];
  const varDecl = methodBody.children.blockStatement[0];
  
  console.log('\nVariable Declaration CST:');
  dumpCST(varDecl, 0, 5);
} catch (e) {
  console.error('ERROR:', (e as any).message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Object Array Type Declaration
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 2: Object Array Type Declaration ==========');
console.log('Code: String[] strings;');

try {
  const cst2 = parse(`
    public class Test {
      public static void main(String[] args) {
        String[] strings;
      }
    }
  `);
  
  const methodBody = cst2.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[0];
  console.log('\nVariable Declaration CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: 2D Array Type Declaration
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 3: 2D Array Type Declaration ==========');
console.log('Code: int[][] matrix;');

try {
  const cst3 = parse(`
    public class Test {
      public static void main(String[] args) {
        int[][] matrix;
      }
    }
  `);
  
  const methodBody = cst3.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[0];
  console.log('\nVariable Declaration CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Array Creation - new int[n]
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 4: Array Creation - new int[n] ==========');
console.log('Code: int[] arr = new int[5];');

try {
  const cst4 = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = new int[5];
      }
    }
  `);
  
  const methodBody = cst4.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[0];
  console.log('\nVariable Declaration with Array Creation:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Array Literal Initialization
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 5: Array Literal Initialization ==========');
console.log('Code: int[] arr = {1, 2, 3};');

try {
  const cst5 = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = {1, 2, 3};
      }
    }
  `);
  
  const methodBody = cst5.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[0];
  console.log('\nArray Literal CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: Array Access
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 6: Array Access ==========');
console.log('Code: int x = arr[0];');

try {
  const cst6 = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = new int[5];
        int x = arr[0];
      }
    }
  `);
  
  const methodBody = cst6.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[1];
  console.log('\nArray Access CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 7: Array Assignment
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 7: Array Assignment ==========');
console.log('Code: arr[0] = 42;');

try {
  const cst7 = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = new int[5];
        arr[0] = 42;
      }
    }
  `);
  
  const methodBody = cst7.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[1];
  console.log('\nArray Assignment CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 8: Array Length Access
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 8: Array Length Access ==========');
console.log('Code: int len = arr.length;');

try {
  const cst8 = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = new int[5];
        int len = arr.length;
      }
    }
  `);
  
  const methodBody = cst8.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[1];
  console.log('\nArray Length Access CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 9: Enhanced For-Each Loop
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 9: Enhanced For-Each Loop ==========');
console.log('Code: for (int x : arr) { ... }');

try {
  const cst9 = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = {1, 2, 3};
        for (int x : arr) {
          System.out.println(x);
        }
      }
    }
  `);
  
  const methodBody = cst9.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[1];
  console.log('\nEnhanced For-Each Loop CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 10: Object Array Creation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 10: Object Array Creation ==========');
console.log('Code: String[] strings = new String[3];');

try {
  const cst10 = parse(`
    public class Test {
      public static void main(String[] args) {
        String[] strings = new String[3];
      }
    }
  `);
  
  const methodBody = cst10.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[0];
  console.log('\nObject Array Creation CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 11: Custom Class Array
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 11: Custom Class Array ==========');
console.log(`
Code: 
  class Point { int x; int y; }
  Point[] points = new Point[5];
`);

try {
  const cst11 = parse(`
    public class Test {
      public static void main(String[] args) {
        Point[] points = new Point[5];
      }
    }
    class Point {
      int x;
      int y;
    }
  `);
  
  const methodBody = cst11.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[0];
  console.log('\nCustom Class Array CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 12: Array Element as Object - Field Access
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 12: Array Element Field Access ==========');
console.log('Code: int x = points[0].x;');

try {
  const cst12 = parse(`
    public class Test {
      public static void main(String[] args) {
        Point[] points = new Point[5];
        int x = points[0].x;
      }
    }
    class Point {
      int x;
    }
  `);
  
  const methodBody = cst12.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[1];
  console.log('\nArray Element Field Access CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 13: Array as Method Parameter
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 13: Array as Method Parameter ==========');
console.log(`
Code:
  void printArray(int[] arr) { ... }
  printArray(new int[5]);
`);

try {
  const cst13 = parse(`
    public class Test {
      void printArray(int[] arr) {
        System.out.println(arr.length);
      }
      public static void main(String[] args) {
        Test t = new Test();
        t.printArray(new int[5]);
      }
    }
  `);
  
  const classBody = cst13.compilation.typeDeclarations[0].classBody.classBodyDeclarations;
  console.log('\nMethod Parameter Array CST (first 2 members):');
  inspectCST(classBody[0]); // printArray method
  console.log('\n---\n');
  inspectCST(classBody[1]); // main method
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 14: Enhanced For-Each with Object Array
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 14: Enhanced For-Each with Object Array ==========');
console.log(`
Code:
  Point[] points = ...;
  for (Point p : points) { ... }
`);

try {
  const cst14 = parse(`
    public class Test {
      public static void main(String[] args) {
        Point[] points = new Point[5];
        for (Point p : points) {
          System.out.println(p.x);
        }
      }
    }
    class Point {
      int x;
    }
  `);
  
  const methodBody = cst14.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[1];
  console.log('\nEnhanced For-Each with Object Array CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 15: Array with Loop and Access
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n\n========== TEST 15: Array with Traditional For Loop ==========');
console.log(`
Code:
  int[] arr = {1, 2, 3};
  for (int i = 0; i < arr.length; i++) {
    System.out.println(arr[i]);
  }
`);

try {
  const cst15 = parse(`
    public class Test {
      public static void main(String[] args) {
        int[] arr = {1, 2, 3};
        for (int i = 0; i < arr.length; i++) {
          System.out.println(arr[i]);
        }
      }
    }
  `);
  
  const methodBody = cst15.compilation.typeDeclarations[0].classBody.classBodyDeclarations[0].methodDeclarator.methodBody.blockStatements[1];
  console.log('\nTraditional For Loop with Array Access CST:');
  inspectCST(methodBody);
} catch (e) {
  console.error('ERROR:', e.message);
}

console.log('\n\n========== EXPLORATION COMPLETE ==========\n');
console.log('Next steps: Review CST output, update AST contract, update parser.');
