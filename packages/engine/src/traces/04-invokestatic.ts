import type { Step } from '../types.js';

/**
 * Example 4 — Static method call (invokestatic)
 *
 * Java source (illustrative):
 *   class MathUtils {
 *     static int square(int n) { return n * n; }
 *     public static void main(String[] args) {
 *       int result = MathUtils.square(5);
 *       System.out.println(result);
 *     }
 *   }
 *
 * Key concepts shown:
 *  - invokestatic: no object, no vtable lookup, no klass-pointer follow
 *  - method resolved at compile time directly to MathUtils.square
 *  - no heap allocation for a static call
 */
export const invokeStatic: Step[] = [
  // ── Step 0: main begins ───────────────────────────────────────────────────
  {
    stepIndex: 0,
    label: 'main() begins — MathUtils loaded',
    sourceLineNumber: 7,
    stack: [
      {
        frameId: 'frame-0',
        className: 'MathUtils',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 7,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'MathUtils',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          // square is NOT in the vtable — static methods are not virtually dispatched
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'MathUtils' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: null,
    stdout: [],
  },

  // ── Step 1: invokestatic MathUtils.square(5) ─────────────────────────────
  {
    stepIndex: 1,
    label: 'invokestatic MathUtils.square(5) — no heap, no vtable, frame pushed directly',
    sourceLineNumber: 7,
    stack: [
      {
        frameId: 'frame-0',
        className: 'MathUtils',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 7,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        threadId: 'main',
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'MathUtils',
        methodName: 'square',
        descriptor: '(I)I',
        lineNumber: 3,
        locals: [
          // No `this` slot — static method
          { slot: 0, name: 'n', value: { kind: 'int', value: 5 } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'MathUtils',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'MathUtils' },
        ],
        itable: [],
      },
    ],
    // No arrows — invokestatic has no receiver, no klass-pointer follow
    arrows: [],
    delta: {
      operation: 'invokestatic',
      description: 'invokestatic: method resolved at compile-time to MathUtils.square — no object, no vtable lookup',
      highlightedElements: [{ region: 'stack', elementId: 'frame-1' }],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 2: imul n * n = 25, return value ────────────────────────────────
  {
    stepIndex: 2,
    label: 'square: n * n = 25 computed',
    sourceLineNumber: 3,
    stack: [
      {
        frameId: 'frame-0',
        className: 'MathUtils',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 7,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        threadId: 'main',
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'MathUtils',
        methodName: 'square',
        descriptor: '(I)I',
        lineNumber: 3,
        locals: [
          { slot: 0, name: 'n', value: { kind: 'int', value: 5 } },
        ],
        operandStack: [{ kind: 'int', value: 25 }],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'MathUtils',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'MathUtils' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: {
      operation: 'return',
      description: 'imul: 5 * 5 = 25 pushed to operand stack, ready to return',
      highlightedElements: [{ region: 'stack', elementId: 'frame-1' }],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 3: ireturn — result = 25 in main ────────────────────────────────
  {
    stepIndex: 3,
    label: 'ireturn — square frame popped, result = 25 in main',
    sourceLineNumber: 7,
    stack: [
      {
        frameId: 'frame-0',
        className: 'MathUtils',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 7,
        locals: [
          { slot: 0, name: 'args',   value: { kind: 'null' } },
          { slot: 1, name: 'result', value: { kind: 'int', value: 25 } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'MathUtils',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'MathUtils' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: {
      operation: 'return',
      description: 'ireturn — square frame popped, return value 25 stored in local `result`',
      highlightedElements: [{ region: 'stack', elementId: 'frame-0', fieldName: 'result' }],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 4: println — output 25 ──────────────────────────────────────────
  {
    stepIndex: 4,
    label: 'System.out.println(25) — output: 25',
    sourceLineNumber: 8,
    stack: [
      {
        frameId: 'frame-0',
        className: 'MathUtils',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 8,
        locals: [
          { slot: 0, name: 'args',   value: { kind: 'null' } },
          { slot: 1, name: 'result', value: { kind: 'int', value: 25 } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'MathUtils',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'MathUtils' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: {
      operation: 'invokevirtual',
      description: 'System.out.println(result) — value 25 printed',
      highlightedElements: [],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: ['25'],
  },
];
