import { deepStrictEqual, strictEqual } from 'node:assert';
import { runJava, runJavaThreadSession } from './index.js';

const MANY_WORKERS_SOURCE = `
class Counter {
  int count = 0;

  synchronized void incSlow(String who) {
    int before = count;
    Thread.sleep(1);
    count = before + 1;
    System.out.println(who + " -> " + count);
  }
}

class Main {
  static void main() {
    Counter c = new Counter();
    // @thread "W1" { run: c.incSlow("W1") }
    // @thread "W2" { run: c.incSlow("W2") }
    // @thread "W3" { run: c.incSlow("W3") }
    // @thread "W4" { run: c.incSlow("W4") }
    // @thread "W5" { run: c.incSlow("W5") }
    // @thread "W6" { run: c.incSlow("W6") }
  }
}
`;

const SINGLE_THREAD_SOURCE = `
class Main {
  static void main() {
    int a = 1;
    int b = 2;
    System.out.println("sum=" + (a + b));
  }
}
`;

function fail(message: string): never {
  throw new Error(message);
}

function readCounterValue(steps: ReturnType<ReturnType<typeof runJavaThreadSessionOrThrow>['drain']>['steps']): number {
  const finalStep = steps[steps.length - 1];
  if (!finalStep) fail('missing final step');

  const counter = finalStep.heap.find((obj) => obj.klassName === 'Counter');
  if (!counter) fail('Counter object missing in heap');

  const slot = counter.fields.find((f) => f.name === 'count');
  if (!slot || slot.value.kind !== 'int') fail('Counter.count is not an int');
  return slot.value.value;
}

function runJavaThreadSessionOrThrow(source: string) {
  const maybeSession = runJavaThreadSession(source);
  if ('error' in maybeSession) {
    fail(`session init failed: ${JSON.stringify(maybeSession.error)}`);
  }
  return maybeSession;
}

function testManyWorkers() {
  const session = runJavaThreadSessionOrThrow(MANY_WORKERS_SOURCE);
  strictEqual(session.pendingThreads().length, 6, 'expected six queued worker threads');

  const drained = session.drain();
  strictEqual(drained.error, null, 'many-worker run should not error');
  strictEqual(drained.pendingThreads.length, 0, 'all worker threads should complete');

  const count = readCounterValue(drained.steps);
  strictEqual(count, 6, 'all synchronized increments must apply exactly once');

  const stdout = drained.steps[drained.steps.length - 1]?.stdout ?? [];
  strictEqual(stdout.length, 6, 'expected one stdout line per worker');

  const descriptions = drained.steps
    .map((s) => s.delta?.description ?? '')
    .filter(Boolean);

  for (const tid of ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']) {
    strictEqual(
      descriptions.some((d) => d.includes(`thread_dispatch — ${tid}`)),
      true,
      `missing dispatch event for ${tid}`,
    );
  }
}

function testSingleThreadParity() {
  const normal = runJava(SINGLE_THREAD_SOURCE);
  if (normal.error) fail(`runJava error: ${JSON.stringify(normal.error)}`);

  const session = runJavaThreadSessionOrThrow(SINGLE_THREAD_SOURCE);
  strictEqual(session.pendingThreads().length, 0, 'single-thread program should have no pending workers');
  strictEqual(session.initial.error, null, 'single-thread session should not error');

  const drained = session.drain();
  strictEqual(drained.error, null, 'single-thread drain should not error');
  strictEqual(drained.pendingThreads.length, 0, 'single-thread drain should keep pending list empty');

  const normalFinal = normal.steps[normal.steps.length - 1];
  const drainedFinal = drained.steps[drained.steps.length - 1];
  if (!normalFinal || !drainedFinal) fail('missing final step in single-thread comparison');

  deepStrictEqual(drainedFinal.stdout, normalFinal.stdout, 'single-thread stdout should match runJava output');
  strictEqual(drainedFinal.label.includes('main_complete'), true, 'single-thread session should end with main_complete marker');
}

function main() {
  testManyWorkers();
  testSingleThreadParity();
  console.log('PASS thread many-workers + single-thread parity');
}

main();
