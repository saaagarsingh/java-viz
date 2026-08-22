import type { Step } from '../types.js';

/**
 * Example 1 — Object creation and field layout
 *
 * Java source (illustrative):
 *   class Point {
 *     int x;
 *     int y;
 *     Point(int x, int y) {
 *       this.x = x;
 *       this.y = y;
 *     }
 *     public static void main(String[] args) {
 *       Point p = new Point(3, 7);
 *       System.out.println(p.x);
 *     }
 *   }
 */
export const objectCreation: Step[] = [
  // ── Step 0: initial state — JVM loaded, main about to run ─────────────────
  {
    stepIndex: 0,
    label: 'Program start — Point loaded into Metaspace',
    sourceLineNumber: 11,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Point',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 11,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'Point',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Point' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: null,
    stdout: [],
  },

  // ── Step 1: `new Point(3, 7)` — heap object allocated, fields zeroed ───────
  {
    stepIndex: 1,
    label: 'new Point(3, 7) — heap object allocated, fields at defaults',
    sourceLineNumber: 11,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Point',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 11,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [{ kind: 'ref', objectId: 'obj-1' }],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Point',
        fields: [
          { name: 'x', declaredIn: 'Point', value: { kind: 'int', value: 0 } },
          { name: 'y', declaredIn: 'Point', value: { kind: 'int', value: 0 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Point',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Point' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'  },
        to:   { region: 'metaspace', elementId: 'Point'  },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
    ],
    delta: {
      operation: 'new_object',
      description: 'new Point — object allocated on heap, instance fields initialised to defaults (int → 0)',
      highlightedElements: [{ region: 'heap', elementId: 'obj-1' }],
      newArrows: ['arr-obj1-klass'],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 2: invokespecial Point.<init> — constructor frame pushed ──────────
  {
    stepIndex: 2,
    label: 'invokespecial Point.<init>(3, 7) — constructor frame pushed',
    sourceLineNumber: 11,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Point',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 11,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Point',
        methodName: '<init>',
        descriptor: '(II)V',
        lineNumber: 5,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
          { slot: 1, name: 'x',    value: { kind: 'int', value: 3 } },
          { slot: 2, name: 'y',    value: { kind: 'int', value: 7 } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Point',
        fields: [
          { name: 'x', declaredIn: 'Point', value: { kind: 'int', value: 0 } },
          { name: 'y', declaredIn: 'Point', value: { kind: 'int', value: 0 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Point',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Point' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Point' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-this-obj1',
        from: { region: 'stack',    elementId: 'frame-1', fieldName: 'this' },
        to:   { region: 'heap',     elementId: 'obj-1' },
        operation: 'invokespecial',
      },
    ],
    delta: {
      operation: 'invokespecial',
      description: 'invokespecial Point.<init> — constructor frame pushed, `this` = obj-1, x=3, y=7',
      highlightedElements: [{ region: 'stack', elementId: 'frame-1' }],
      newArrows: ['arr-this-obj1'],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 3: putfield this.x = 3 ───────────────────────────────────────────
  {
    stepIndex: 3,
    label: 'putfield Point.x = 3',
    sourceLineNumber: 6,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Point',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 11,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Point',
        methodName: '<init>',
        descriptor: '(II)V',
        lineNumber: 6,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
          { slot: 1, name: 'x',    value: { kind: 'int', value: 3 } },
          { slot: 2, name: 'y',    value: { kind: 'int', value: 7 } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Point',
        fields: [
          { name: 'x', declaredIn: 'Point', value: { kind: 'int', value: 3 } },
          { name: 'y', declaredIn: 'Point', value: { kind: 'int', value: 0 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Point',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Point' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Point' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-this-obj1',
        from: { region: 'stack', elementId: 'frame-1', fieldName: 'this' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'invokespecial',
      },
    ],
    delta: {
      operation: 'putfield',
      description: 'putfield — this.x written with value 3',
      highlightedElements: [{ region: 'heap', elementId: 'obj-1', fieldName: 'x' }],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 4: putfield this.y = 7 ───────────────────────────────────────────
  {
    stepIndex: 4,
    label: 'putfield Point.y = 7',
    sourceLineNumber: 7,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Point',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 11,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Point',
        methodName: '<init>',
        descriptor: '(II)V',
        lineNumber: 7,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
          { slot: 1, name: 'x',    value: { kind: 'int', value: 3 } },
          { slot: 2, name: 'y',    value: { kind: 'int', value: 7 } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Point',
        fields: [
          { name: 'x', declaredIn: 'Point', value: { kind: 'int', value: 3 } },
          { name: 'y', declaredIn: 'Point', value: { kind: 'int', value: 7 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Point',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Point' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Point' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-this-obj1',
        from: { region: 'stack', elementId: 'frame-1', fieldName: 'this' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'invokespecial',
      },
    ],
    delta: {
      operation: 'putfield',
      description: 'putfield — this.y written with value 7',
      highlightedElements: [{ region: 'heap', elementId: 'obj-1', fieldName: 'y' }],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 5: constructor returns — frame-1 popped ──────────────────────────
  {
    stepIndex: 5,
    label: 'return from Point.<init> — constructor frame popped',
    sourceLineNumber: 11,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Point',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 11,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'p',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Point',
        fields: [
          { name: 'x', declaredIn: 'Point', value: { kind: 'int', value: 3 } },
          { name: 'y', declaredIn: 'Point', value: { kind: 'int', value: 7 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Point',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Point' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Point' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-p-obj1',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'p' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'return',
      },
    ],
    delta: {
      operation: 'return',
      description: 'return from <init> — constructor frame popped, local `p` now holds ref to obj-1',
      highlightedElements: [{ region: 'stack', elementId: 'frame-0', fieldName: 'p' }],
      newArrows: ['arr-p-obj1'],
      fadingArrows: ['arr-this-obj1'],
    },
    stdout: [],
  },

  // ── Step 6: getfield p.x ──────────────────────────────────────────────────
  {
    stepIndex: 6,
    label: 'getfield p.x — reads 3 from heap',
    sourceLineNumber: 12,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Point',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 12,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'p',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [{ kind: 'int', value: 3 }],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Point',
        fields: [
          { name: 'x', declaredIn: 'Point', value: { kind: 'int', value: 3 } },
          { name: 'y', declaredIn: 'Point', value: { kind: 'int', value: 7 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Point',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Point' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Point' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-p-obj1',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'p' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'return',
      },
    ],
    delta: {
      operation: 'getfield',
      description: 'getfield — p.x read from heap, value 3 pushed onto operand stack',
      highlightedElements: [
        { region: 'heap',  elementId: 'obj-1',   fieldName: 'x' },
        { region: 'stack', elementId: 'frame-0' },
      ],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 7: println — output 3 ────────────────────────────────────────────
  {
    stepIndex: 7,
    label: 'invokevirtual PrintStream.println(3) — output: 3',
    sourceLineNumber: 12,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Point',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 12,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'p',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Point',
        fields: [
          { name: 'x', declaredIn: 'Point', value: { kind: 'int', value: 3 } },
          { name: 'y', declaredIn: 'Point', value: { kind: 'int', value: 7 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Point',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Point' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Point' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-p-obj1',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'p' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'return',
      },
    ],
    delta: {
      operation: 'invokevirtual',
      description: 'System.out.println(3) — p.x value printed to stdout',
      highlightedElements: [],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: ['3'],
  },
];
