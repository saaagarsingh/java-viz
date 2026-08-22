/**
 * Phase 2 Synchronization Test
 * 
 * Simple test to verify:
 * 1. Synchronized methods (isSynchronized = true)
 * 2. Volatile fields (isVolatile = true)
 * 3. Synchronized blocks (SynchronizedStmt)
 * 4. Lock acquisition and release
 */
public class Counter {
  private volatile int count = 0;
  
  // Explicit no-arg constructor
  Counter() {}
  
  // Synchronized method
  synchronized int increment() {
    count++;
    return count;
  }
  
  // Regular method with synchronized block
  int incrementBlocked() {
    synchronized (this) {
      count++;
    }
    return count;
  }
  
  public static void main(String[] args) {
    Counter c = new Counter();
    System.out.println(c.increment());      // 1
    System.out.println(c.incrementBlocked()); // 2
    System.out.println(c.count);            // 2
  }
}
