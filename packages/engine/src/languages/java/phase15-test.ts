/**
 * Phase 1.5 parser/interpreter smoke-test runner.
 *
 * Run directly: npx ts-node --esm packages/engine/src/languages/java/phase15-test.ts
 * Or via: cd packages/engine && npx tsx src/languages/java/phase15-test.ts
 */

import { parseJava } from './parser.js';

// ── Phase 1.5 test program ────────────────────────────────────────────────────
// Exercises exactly: ternary, instanceof, break/continue, overloading by arity,
// and pre/post ++/-- (already working — included as regression).

const PHASE_15_SOURCE = `
class Shape {
    String name;
    int sides;

    Shape(String name) {
        this.name = name;
        this.sides = 0;
    }

    Shape(String name, int sides) {
        this.name = name;
        this.sides = sides;
    }

    String describe() {
        return name;
    }

    String describe(int verbosity) {
        return name + " with " + sides + " sides";
    }
}

class Circle extends Shape {
    int radius;

    Circle(int radius) {
        super("Circle");
        this.radius = radius;
    }

    String describe() {
        return "Circle(r=" + radius + ")";
    }
}

class Rectangle extends Shape {
    int width;
    int height;

    Rectangle(int width, int height) {
        super("Rectangle", 4);
        this.width = width;
        this.height = height;
    }

    String describe() {
        return "Rect(" + width + "x" + height + ")";
    }
}

class Main {
    static void main() {
        // Overloading by arity: Shape(String) vs Shape(String, int)
        Shape s1 = new Shape("Generic");
        Shape s2 = new Shape("Polygon", 6);

        // Pre/post ++ (regression)
        int counter = 0;
        counter++;
        ++counter;
        int preVal  = ++counter;
        int postVal = counter++;

        // Ternary
        int x = 10;
        int y = 20;
        int bigger = (x > y) ? x : y;
        String label = (bigger == 20) ? "y wins" : "x wins";

        // instanceof — check before dispatch
        Shape c = new Circle(5);
        Shape r = new Rectangle(3, 4);
        boolean isCircle    = c instanceof Circle;
        boolean isRect      = c instanceof Rectangle;
        boolean isShape     = c instanceof Shape;

        // break in for loop
        int found = -1;
        for (int i = 0; i < 10; i++) {
            if (i == 5) {
                found = i;
                break;
            }
        }

        // continue in for loop
        int sum = 0;
        for (int j = 0; j < 10; j++) {
            if (j == 3) continue;
            if (j == 7) continue;
            sum = sum + j;
        }

        // break in while loop
        int n = 0;
        while (n < 100) {
            if (n == 8) break;
            n++;
        }

        // Overloaded method dispatch: describe() vs describe(int)
        String d1 = s1.describe();
        String d2 = s2.describe(2);

        // Polymorphic describe via vtable (invokevirtual)
        String cd = c.describe();
        String rd = r.describe();

        System.out.println("counter=" + counter);
        System.out.println("preVal=" + preVal);
        System.out.println("postVal=" + postVal);
        System.out.println("bigger=" + bigger);
        System.out.println("label=" + label);
        System.out.println("isCircle=" + isCircle);
        System.out.println("isRect=" + isRect);
        System.out.println("isShape=" + isShape);
        System.out.println("found=" + found);
        System.out.println("sum=" + sum);
        System.out.println("n=" + n);
        System.out.println("d1=" + d1);
        System.out.println("d2=" + d2);
        System.out.println("cd=" + cd);
        System.out.println("rd=" + rd);
    }
}
`;

// ── Run ───────────────────────────────────────────────────────────────────────

console.log('=== Phase 1.5 Parser Smoke Test ===\n');

try {
  const ast = parseJava(PHASE_15_SOURCE);
  console.log('✅ Parse succeeded');
  console.log(`   Classes: ${ast.classes.map(c => c.name).join(', ')}`);
  for (const cls of ast.classes) {
    console.log(`   ${cls.name}: ${cls.constructors.length} ctor(s), ${cls.methods.length} method(s)`);
    for (const m of cls.methods) {
      console.log(`     method: ${m.name}(${m.params.length} params)`);
    }
  }
} catch (e: any) {
  console.error('❌ Parse failed:', e.message);
  if (e.line) console.error('   at line:', e.line);
  if (e.feature) console.error('   feature:', e.feature);
}
