import { deepStrictEqual, strictEqual } from 'node:assert';
import { runJava, runJavaThreadSession } from './index.js';

const SINGLE_THREAD_SOURCE = `
class Main {
  static void main() {
    int a = 2;
    int b = 3;
    int c = a + b;
    System.out.println("sum=" + c);
  }
}
`;

function fail(message: string): never {
  throw new Error(message);
}

function main() {
  const normal = runJava(SINGLE_THREAD_SOURCE);
  if (normal.error) fail(`runJava error: ${JSON.stringify(normal.error)}`);

  const maybeSession = runJavaThreadSession(SINGLE_THREAD_SOURCE);
  if ('error' in maybeSession) fail(`runJavaThreadSession error: ${JSON.stringify(maybeSession.error)}`);

  strictEqual(maybeSession.pendingThreads().length, 0, 'No thread directives should produce no pending threads');
  deepStrictEqual(maybeSession.initial.error, normal.error, 'Initial session error should match normal run');
  deepStrictEqual(maybeSession.initial.steps, normal.steps, 'Initial session steps should match normal run exactly');

  const drained = maybeSession.drain();
  strictEqual(drained.pendingThreads.length, 0, 'Drain should keep pending thread list empty');
  deepStrictEqual(drained.error, null, 'Drain should not introduce error in single-thread program');
  deepStrictEqual(drained.steps, normal.steps, 'Drain output should remain identical for single-thread program');

  const finalStdout = drained.steps[drained.steps.length - 1]?.stdout ?? [];
  strictEqual(finalStdout.includes('sum=5'), true, 'Expected stdout line sum=5');

  console.log('PASS thread-session parity (single-thread no directives)');
  console.log(`steps=${normal.steps.length} stdout=${finalStdout.join(' | ')}`);
}

main();
