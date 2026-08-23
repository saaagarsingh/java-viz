import { strictEqual } from 'node:assert';
import { runJavaThreadSession } from './index.js';

const CONTENTION_SOURCE = `
class Counter {
  int count = 0;

  synchronized void inc() {
    count++;
  }

  int get() {
    return count;
  }
}

class Main {
  static void main() {
    Counter c = new Counter();
    // @thread "Worker-1" { run: c.inc() }
    // @thread "Worker-2" { run: c.inc() }
    // @thread "Worker-3" { run: c.inc() }
  }
}
`;

const REENTRANT_SOURCE = `
class ReentrantCounter {
  int count = 0;

  synchronized void outer() {
    inner();
  }

  synchronized void inner() {
    count++;
  }
}

class Main {
  static void main() {
    ReentrantCounter c = new ReentrantCounter();
    // @thread "Worker-1" { run: c.outer() }
    // @thread "Worker-2" { run: c.outer() }
  }
}
`;

function runSessionOrThrow(source: string) {
  const maybeSession = runJavaThreadSession(source);
  if ('error' in maybeSession) {
    throw new Error(`session init failed: ${JSON.stringify(maybeSession.error)}`);
  }
  return maybeSession;
}

function getFieldInt(finalSteps: ReturnType<ReturnType<typeof runSessionOrThrow>['drain']>['steps'], className: string, fieldName: string): number {
  const finalStep = finalSteps[finalSteps.length - 1];
  if (!finalStep) throw new Error('no final step generated');

  const obj = finalStep.heap.find((h) => h.klassName === className);
  if (!obj) throw new Error(`heap object for class ${className} not found`);

  const slot = obj.fields.find((f) => f.name === fieldName);
  if (!slot || slot.value.kind !== 'int') {
    throw new Error(`field ${className}.${fieldName} is not an int in final step`);
  }

  return slot.value.value;
}

function assertNoLockedObjects(finalSteps: ReturnType<ReturnType<typeof runSessionOrThrow>['drain']>['steps']) {
  const finalStep = finalSteps[finalSteps.length - 1];
  if (!finalStep) throw new Error('no final step generated');

  const locked = finalStep.heap.filter((h) => h.markWord && h.markWord !== 'unlocked');
  strictEqual(locked.length, 0, `expected all monitors released, found locked objects: ${locked.map((x) => x.objectId).join(', ')}`);
}

function testContention() {
  const session = runSessionOrThrow(CONTENTION_SOURCE);
  strictEqual(session.pendingThreads().length, 3, 'expected three queued worker threads');

  const drained = session.drain();
  strictEqual(drained.error, null, 'contention scenario should not produce runtime error');
  strictEqual(drained.pendingThreads.length, 0, 'all worker threads should complete');

  const count = getFieldInt(drained.steps, 'Counter', 'count');
  strictEqual(count, 3, 'all three synchronized increments must apply exactly once');
  assertNoLockedObjects(drained.steps);
}

function testReentrant() {
  const session = runSessionOrThrow(REENTRANT_SOURCE);
  strictEqual(session.pendingThreads().length, 2, 'expected two queued worker threads');

  const drained = session.drain();
  strictEqual(drained.error, null, 'reentrant scenario should not produce runtime error');
  strictEqual(drained.pendingThreads.length, 0, 'all worker threads should complete');

  const count = getFieldInt(drained.steps, 'ReentrantCounter', 'count');
  strictEqual(count, 2, 'reentrant synchronized path should increment once per worker');
  assertNoLockedObjects(drained.steps);
}

function main() {
  testContention();
  testReentrant();

  console.log('PASS thread lock behavior');
}

main();
