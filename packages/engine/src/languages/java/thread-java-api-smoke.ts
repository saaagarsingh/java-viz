import { strictEqual } from 'node:assert';
import { runJava } from './index.js';

const THREAD_BASE_SOURCE = `
class Main {
  static void main() {
    Thread t = new Thread("Worker-A");
    t.start();
    t.join();
    System.out.println("done");
  }
}
`;

const THREAD_SUBCLASS_SOURCE = `
class Counter {
  static int count = 0;
  synchronized static void inc() {
    count++;
  }
}

class Worker extends Thread {
  void run() {
    Counter.inc();
  }
}

class Main {
  static void main() {
    Worker t1 = new Worker();
    Worker t2 = new Worker();
    t1.start();
    t2.start();
    t1.join();
    t2.join();
    System.out.println("count=" + Counter.count);
  }
}
`;

const THREAD_RUNNABLE_CTOR_SOURCE = `
class Counter {
  static int count = 0;
  synchronized static void inc() {
    count++;
  }
}

class Task implements Runnable {
  void run() {
    Counter.inc();
  }
}

class Main {
  static void main() {
    Task task = new Task();
    Thread t = new Thread(task, "TaskThread");
    t.start();
    t.join();
    System.out.println("count=" + Counter.count);
  }
}
`;

const THREAD_JOIN_TIMEOUT_SOURCE = `
class Gate {
  static int count = 0;

  synchronized static void workerStep() {
    count++;
  }

  synchronized static void holdAndJoin(Thread t) {
    t.start();
    t.join(2);
    System.out.println("main-after-timeout");
  }
}

class SlowWorker extends Thread {
  void run() {
    Gate.workerStep();
    System.out.println("worker-done");
  }
}

class Main {
  static void main() {
    SlowWorker t = new SlowWorker();
    Gate.holdAndJoin(t);
    t.join();
    System.out.println("main-after-join");
  }
}
`;

const MONITOR_NOTIFY_SOURCE = `
class Main {
  static void main() {
    Object lock = new Object();
    synchronized (lock) {
      lock.notify();
      lock.notifyAll();
    }
    System.out.println("notify-ok");
  }
}
`;

function finalStdout(source: string): string[] {
  const out = runJava(source);
  strictEqual(out.error, null, `unexpected error: ${JSON.stringify(out.error)}`);
  return out.steps[out.steps.length - 1]?.stdout ?? [];
}

function runAndCollect(source: string) {
  const out = runJava(source);
  strictEqual(out.error, null, `unexpected error: ${JSON.stringify(out.error)}`);
  return out;
}

function main() {
  const baseOut = finalStdout(THREAD_BASE_SOURCE);
  strictEqual(baseOut.includes('done'), true, 'Thread base API smoke should print done');

  const subclassOut = finalStdout(THREAD_SUBCLASS_SOURCE);
  strictEqual(subclassOut.includes('count=2'), true, 'Thread subclass run() with join should print count=2');

  const runnableCtorOut = finalStdout(THREAD_RUNNABLE_CTOR_SOURCE);
  strictEqual(runnableCtorOut.includes('count=1'), true, 'Thread(Runnable, String) should execute target.run() once');

  const timeoutRun = runAndCollect(THREAD_JOIN_TIMEOUT_SOURCE);
  const labels = timeoutRun.steps.map((s) => s.label);
  strictEqual(labels.some((l) => l.includes('thread_join_timeout')), true, 'join(timeout) should emit timeout step when target is still running');
  strictEqual(labels.some((l) => l.includes('thread_wakeup') && l.includes('join timeout')), true, 'join(timeout) should emit timeout wake-up step');
  const timeoutStdout = timeoutRun.steps[timeoutRun.steps.length - 1]?.stdout ?? [];
  strictEqual(timeoutStdout.includes('worker-done'), true, 'worker should eventually complete');
  strictEqual(timeoutStdout.includes('main-after-timeout'), true, 'main should continue after timeout join');
  strictEqual(timeoutStdout.includes('main-after-join'), true, 'main should complete after full join');

  const notifyRun = runAndCollect(MONITOR_NOTIFY_SOURCE);
  const notifyLabels = notifyRun.steps.map((s) => s.label);
  strictEqual(notifyLabels.some((l) => l.includes('monitor_notify —')), true, 'notify() should emit monitor_notify step');
  strictEqual(notifyLabels.some((l) => l.includes('monitor_notifyAll —')), true, 'notifyAll() should emit monitor_notifyAll step');
  const notifyStdout = notifyRun.steps[notifyRun.steps.length - 1]?.stdout ?? [];
  strictEqual(notifyStdout.includes('notify-ok'), true, 'notify smoke should complete successfully');

  console.log('PASS thread Java API smoke');
}

main();
