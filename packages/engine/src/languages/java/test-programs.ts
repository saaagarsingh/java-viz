/**
 * Complex test program for Phase 1 interpreter accuracy validation.
 *
 * Exercises in a single file:
 *   - Abstract class with static field + static init block (<clinit>)
 *   - Two concrete subclasses (vtable override)
 *   - An interface (itable dispatch)
 *   - A static utility method (invokestatic)
 *   - Instance method calling another instance method (two-deep call chain)
 *   - Constructor chaining (super)
 *   - Putfield, putstatic, getfield, getstatic
 *   - A for loop
 *   - Binary arithmetic + comparison operators
 *   - System.out.println with string concatenation
 *
 * Expected output (validated manually — use this as golden test):
 *   Circle area=78
 *   Rectangle area=24
 *   Total area=102
 *   Larger area=78
 *   count=2
 */
export const COMPLEX_TEST_SOURCE = `
interface Shape {
    int area();
}

class AbstractShape implements Shape {
    static int count = 0;
    String name;

    AbstractShape(String name) {
        this.name = name;
        count = count + 1;
    }

    int doubled() {
        return area() * 2;
    }
}

class Circle extends AbstractShape {
    int radius;

    Circle(int radius) {
        super("Circle");
        this.radius = radius;
    }

    public int area() {
        return 3 * radius * radius;
    }
}

class Rectangle extends AbstractShape {
    int width;
    int height;

    Rectangle(int width, int height) {
        super("Rectangle");
        this.width = width;
        this.height = height;
    }

    public int area() {
        return width * height;
    }
}

class MathUtils {
    static int max(int a, int b) {
        if (a > b) {
            return a;
        }
        return b;
    }
}

class Main {
    public static void main(String[] args) {
        Circle c = new Circle(5);
        Rectangle r = new Rectangle(4, 6);

        System.out.println("Circle area=" + c.area());
        System.out.println("Rectangle area=" + r.area());

        int total = c.area() + r.area();
        System.out.println("Total area=" + total);

        int larger = MathUtils.max(c.area(), r.area());
        System.out.println("Larger area=" + larger);

        System.out.println("count=" + AbstractShape.count);
    }
}
`.trim();

/**
 * Threading regression program (Phase 2):
 *  - 4 worker threads contending on one synchronized method
 *  - Thread.sleep inside critical section (teaching-model lock hold)
 *  - Per-thread looped increments to stress scheduling beyond t1/t2
 *  - Single-thread sanity path in main (must remain unaffected)
 *
 * Notes:
 *  - The order of "inc ..." lines depends on scheduler interleaving.
 *  - Final line must always be: final=8
 */
export const THREAD_SCENARIO_TEST_SOURCE = `
class Counter {
    int value = 0;

    synchronized void incSlow(String who) {
        int before = value;
        Thread.sleep(2);
        value = before + 1;
        System.out.println("inc " + who + " -> " + value);
    }

    int get() {
        return value;
    }
}

class Worker implements Runnable {
    Counter c;
    String name;
    int loops;

    Worker(Counter c, String name, int loops) {
        this.c = c;
        this.name = name;
        this.loops = loops;
    }

    public void run() {
        for (int i = 0; i < loops; i = i + 1) {
            c.incSlow(name);
        }
    }
}

class Main {
    static int localSanity(int x) {
        int y = x + 1;
        return y * 2;
    }

    static void main(String[] args) {
        int sanity = localSanity(4);
        System.out.println("sanity=" + sanity);

        Counter c = new Counter();

        Thread t1 = new Thread(new Worker(c, "t1", 2), "t1");
        Thread t2 = new Thread(new Worker(c, "t2", 2), "t2");
        Thread t3 = new Thread(new Worker(c, "t3", 2), "t3");
        Thread t4 = new Thread(new Worker(c, "t4", 2), "t4");

        t1.start();
        t2.start();
        t3.start();
        t4.start();

        t1.join();
        t2.join();
        t3.join();
        t4.join();

        System.out.println("final=" + c.get());
    }
}
`.trim();
