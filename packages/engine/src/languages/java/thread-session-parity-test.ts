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

  const drained = maybeSession.drain();
  strictEqual(drained.pendingThreads.length, 0, 'Drain should keep pending thread list empty');
  deepStrictEqual(drained.error, null, 'Drain should not introduce error in single-thread program');

  const normalFinal = normal.steps[normal.steps.length - 1];
  const drainedFinal = drained.steps[drained.steps.length - 1];
  if (!normalFinal || !drainedFinal) fail('Missing final step for parity comparison');

  deepStrictEqual(drainedFinal.stdout, normalFinal.stdout, 'Single-thread stdout should match normal run');
  strictEqual(drainedFinal.label.includes('main_complete'), true, 'Thread-session mode should append main_complete marker');

  const finalStdout = drained.steps[drained.steps.length - 1]?.stdout ?? [];
  strictEqual(finalStdout.includes('sum=5'), true, 'Expected stdout line sum=5');

  console.log('PASS thread-session parity (single-thread no directives)');
  console.log(`steps=${normal.steps.length} stdout=${finalStdout.join(' | ')}`);
}

main();
