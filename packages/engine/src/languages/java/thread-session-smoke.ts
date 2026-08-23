import { strictEqual } from 'node:assert';
import { runJava, runJavaThreadSession } from './index.js';

const SINGLE_THREAD_SOURCE = `
class Main {
  static void main() {
    int a = 1;
    int b = 4;
    System.out.println("single=" + (a + b));
  }
}
`;

const MULTI_THREAD_SOURCE = `
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
    System.out.println("before=" + c.get());
    System.out.println("afterMain=" + c.get());
  }
}
`;

function smokeSingleThread() {
  const normal = runJava(SINGLE_THREAD_SOURCE);
  const maybeSession = runJavaThreadSession(SINGLE_THREAD_SOURCE);
  if ('error' in maybeSession) {
    throw new Error(`single-thread session init failed: ${JSON.stringify(maybeSession.error)}`);
  }

  strictEqual(normal.error, null, 'single-thread normal run should succeed');
  strictEqual(maybeSession.initial.error, null, 'single-thread session init should succeed');
  strictEqual(maybeSession.pendingThreads().length, 0, 'single-thread should have zero pending threads');

  const normalStdout = normal.steps[normal.steps.length - 1]?.stdout ?? [];
  const sessionStdout = maybeSession.initial.steps[maybeSession.initial.steps.length - 1]?.stdout ?? [];
  console.log('[single-thread]');
  console.log(`normal:  steps=${normal.steps.length}, pending=0, stdout=${normalStdout.join(' | ')}`);
  console.log(`session: steps=${maybeSession.initial.steps.length}, pending=${maybeSession.pendingThreads().length}, stdout=${sessionStdout.join(' | ')}`);
}

function smokeMultiThread() {
  const maybeSession = runJavaThreadSession(MULTI_THREAD_SOURCE);
  if ('error' in maybeSession) {
    throw new Error(`multi-thread session init failed: ${JSON.stringify(maybeSession.error)}`);
  }

  const initialPending = maybeSession.pendingThreads();
  console.log('[multi-thread]');
  console.log(`initial: steps=${maybeSession.initial.steps.length}, pending=${initialPending.join(', ') || '(none)'}`);

  const firstThread = initialPending[0];
  if (firstThread) {
    const stepped = maybeSession.stepThread(firstThread);
    console.log(`after step ${firstThread}: steps=${stepped.steps.length}, pending=${stepped.pendingThreads.join(', ') || '(none)'}`);
  }

  const drained = maybeSession.drain();
  const finalStdout = drained.steps[drained.steps.length - 1]?.stdout ?? [];
  console.log(`after drain: steps=${drained.steps.length}, pending=${drained.pendingThreads.join(', ') || '(none)'}`);
  console.log(`stdout=${finalStdout.join(' | ')}`);
}

smokeSingleThread();
smokeMultiThread();
