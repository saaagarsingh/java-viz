import { strictEqual } from 'node:assert';
import { runJava } from './index.js';

function fail(message: string): never {
  throw new Error(message);
}

function runOrThrow(source: string) {
  const result = runJava(source);
  if (result.error) {
    fail(`runJava error: ${JSON.stringify(result.error)}`);
  }
  return result;
}

function finalStdout(result: ReturnType<typeof runOrThrow>): string[] {
  const last = result.steps[result.steps.length - 1];
  if (!last) fail('missing final step');
  return last.stdout;
}

function testArrayOperationsAndEnhancedFor() {
  const source = `
class Main {
  static void main() {
    int[] arr = {1, 2, 3};
    arr[1] = 7;
    int x = arr[1];
    int n = arr.length;

    int sum = 0;
    for (int v : arr) {
      sum = sum + v;
    }

    System.out.println("x=" + x);
    System.out.println("n=" + n);
    System.out.println("sum=" + sum);
  }
}
`;

  const result = runOrThrow(source);
  const out = finalStdout(result);
  strictEqual(out[0], 'x=7');
  strictEqual(out[1], 'n=3');
  strictEqual(out[2], 'sum=11');

  const ops = result.steps.map((s) => s.delta?.operation).filter(Boolean);
  strictEqual(ops.includes('array_create'), true, 'missing array_create step');
  strictEqual(ops.includes('array_store'), true, 'missing array_store step');
  strictEqual(ops.includes('array_load'), true, 'missing array_load step');
}

function testMultiDimensionalDefaults() {
  const source = `
class Main {
  static void main() {
    int[][] matrix = new int[2][3];
    int rows = matrix.length;
    int cols = matrix[0].length;
    int cell = matrix[1][2];

    System.out.println("rows=" + rows);
    System.out.println("cols=" + cols);
    System.out.println("cell=" + cell);
  }
}
`;

  const result = runOrThrow(source);
  const out = finalStdout(result);
  strictEqual(out[0], 'rows=2');
  strictEqual(out[1], 'cols=3');
  strictEqual(out[2], 'cell=0');
}

function testNestedArrayInitializer() {
  const source = `
class Main {
  static void main() {
    int[][] a = {{1, 2}, {3, 4}};
    int sum = 0;
    for (int[] row : a) {
      for (int x : row) {
        sum = sum + x;
      }
    }
    System.out.println("sum=" + sum);
  }
}
`;

  const result = runOrThrow(source);
  const out = finalStdout(result);
  strictEqual(out[0], 'sum=10');
}

function testEnhancedForBreakContinue() {
  const source = `
class Main {
  static void main() {
    int[] arr = {1, 2, 3, 4, 5};
    int sum = 0;
    for (int x : arr) {
      if (x == 2) continue;
      if (x == 5) break;
      sum = sum + x;
    }
    System.out.println("sum=" + sum);
  }
}
`;

  const result = runOrThrow(source);
  const out = finalStdout(result);
  strictEqual(out[0], 'sum=8'); // 1 + 3 + 4
}

function testOutOfBoundsReadError() {
  const source = `
class Main {
  static void main() {
    int[] arr = new int[2];
    int x = arr[2];
    System.out.println(x);
  }
}
`;

  const result = runJava(source);
  if (!result.error) fail('expected out-of-bounds error');
  strictEqual(result.error.kind, 'runtime_error');
  strictEqual(result.error.message.includes('ArrayIndexOutOfBoundsException'), true);
}

function testNegativeArraySizeError() {
  const source = `
class Main {
  static void main() {
    int n = -1;
    int[] arr = new int[n];
    System.out.println(arr.length);
  }
}
`;

  const result = runJava(source);
  if (!result.error) fail('expected negative array size error');
  strictEqual(result.error.kind, 'runtime_error');
  strictEqual(result.error.message.includes('NegativeArraySizeException'), true);
}

function main() {
  testArrayOperationsAndEnhancedFor();
  testMultiDimensionalDefaults();
  testNestedArrayInitializer();
  testEnhancedForBreakContinue();
  testOutOfBoundsReadError();
  testNegativeArraySizeError();

  console.log('PASS phase 5 arrays + enhanced-for');
}

main();
