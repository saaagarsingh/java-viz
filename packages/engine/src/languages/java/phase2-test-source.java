// Phase 2 Test Program — all constructs for parser analysis
// Features: synchronized, volatile, DSL threads

class Counter {
    volatile int count = 0;
    
    synchronized void increment() {
        count++;
    }
    
    void incrementUnsafe() {
        count++;
    }
    
    synchronized int getCount() {
        return count;
    }
}

class Main {
    static void main() {
        Counter c = new Counter();
        
        // DSL: spawn two threads
        // @thread "Worker-1" { run: c.increment() }
        // @thread "Worker-2" { run: c.incrementUnsafe() }
        
        // Also test synchronized block (not just method)
        Object lock = new Object();
        
        // @thread "BlockTest" { run: this.testBlock(lock) }
        
        System.out.println(c.getCount());
    }
    
    void testBlock(Object lock) {
        synchronized (lock) {
            System.out.println("Inside sync block");
        }
    }
}
