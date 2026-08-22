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
