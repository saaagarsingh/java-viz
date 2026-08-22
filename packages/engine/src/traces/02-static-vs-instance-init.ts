import type { Step } from '../types.js';

/**
 * Example 2 — Static vs instance init order
 *
 * Java source (illustrative):
 *   class Counter {
 *     static int count = 0;          // static field, initialised in <clinit>
 *     int id;
 *
 *     static { count = 10; }         // static init block, runs once
 *
 *     Counter() {
 *       count++;
 *       this.id = count;
 *     }
 *
 *     public static void main(String[] args) {
 *       Counter a = new Counter();   // count → 11, a.id = 11
 *       Counter b = new Counter();   // count → 12, b.id = 12
 *     }
 *   }
 *
 * Key concepts shown:
 *  - <clinit> runs exactly once before first instance
 *  - static field lives in Metaspace (KlassInfo.staticFields), not on heap
 *  - each instance gets its own `id` field, but shares `count`
 */
export const staticVsInstanceInit: Step[] = [
  // ── Step 0: main frame pushed, class not yet initialized ──────────────────
  {
    stepIndex: 0,
    label: 'main() begins — Counter not yet initialized',
    sourceLineNumber: 16,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Counter',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 16,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'Counter',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: false,  // <clinit> has NOT run yet
        staticFields: [
          { name: 'count', declaredIn: 'Counter', value: { kind: 'uninitialized' } },
        ],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Counter' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: null,
    stdout: [],
  },

  // ── Step 1: <clinit> triggered — static field set to 0, then block runs ───
  {
    stepIndex: 1,
    label: 'clinit — static int count = 0, then static block sets count = 10',
    sourceLineNumber: 7,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Counter',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 16,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-clinit',
        className: 'Counter',
        methodName: '<clinit>',
        descriptor: '()V',
        lineNumber: 7,
        locals: [],
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'Counter',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: false,
        staticFields: [
          { name: 'count', declaredIn: 'Counter', value: { kind: 'int', value: 10 } },
        ],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Counter' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: {
      operation: 'clinit',
      description: '<clinit> runs: static field count initialised to 0, then static block sets count = 10',
      highlightedElements: [
        { region: 'metaspace', elementId: 'Counter', fieldName: 'count' },
        { region: 'stack',     elementId: 'frame-clinit' },
      ],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 2: <clinit> returns — Counter.isInitialized = true ───────────────
  {
    stepIndex: 2,
    label: 'clinit complete — Counter marked initialized',
    sourceLineNumber: 16,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Counter',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 16,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'Counter',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,  // ← now true
        staticFields: [
          { name: 'count', declaredIn: 'Counter', value: { kind: 'int', value: 10 } },
        ],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Counter' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: {
      operation: 'return',
      description: '<clinit> returns — Counter is now fully initialized, count = 10',
      highlightedElements: [{ region: 'metaspace', elementId: 'Counter' }],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 3: new Counter() — first instance, obj-1 allocated ───────────────
  {
    stepIndex: 3,
    label: 'new Counter() — obj-1 allocated, <init> frame pushed',
    sourceLineNumber: 16,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Counter',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 16,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Counter',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 10,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Counter',
        fields: [
          { name: 'id', declaredIn: 'Counter', value: { kind: 'int', value: 0 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Counter',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [
          { name: 'count', declaredIn: 'Counter', value: { kind: 'int', value: 10 } },
        ],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Counter' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Counter' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-this-1',
        from: { region: 'stack', elementId: 'frame-1', fieldName: 'this' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'invokespecial',
      },
    ],
    delta: {
      operation: 'new_object',
      description: 'new Counter() — obj-1 allocated on heap (id = 0), <clinit> NOT re-run (already initialized)',
      highlightedElements: [{ region: 'heap', elementId: 'obj-1' }],
      newArrows: ['arr-obj1-klass', 'arr-this-1'],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 4: count++ (putstatic), this.id = count (putfield) ───────────────
  {
    stepIndex: 4,
    label: 'Counter.<init>: count++ → 11, this.id = 11',
    sourceLineNumber: 12,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Counter',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 16,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Counter',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 12,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Counter',
        fields: [
          { name: 'id', declaredIn: 'Counter', value: { kind: 'int', value: 11 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Counter',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [
          { name: 'count', declaredIn: 'Counter', value: { kind: 'int', value: 11 } },
        ],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Counter' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Counter' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-this-1',
        from: { region: 'stack', elementId: 'frame-1', fieldName: 'this' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'invokespecial',
      },
    ],
    delta: {
      operation: 'putstatic',
      description: 'putstatic Counter.count → 11 (count++); putfield this.id = 11',
      highlightedElements: [
        { region: 'metaspace', elementId: 'Counter', fieldName: 'count' },
        { region: 'heap',      elementId: 'obj-1',   fieldName: 'id'    },
      ],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 5: first constructor returns — a = obj-1 ─────────────────────────
  {
    stepIndex: 5,
    label: 'return from <init> — a holds ref to obj-1',
    sourceLineNumber: 16,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Counter',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 16,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'a',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Counter',
        fields: [
          { name: 'id', declaredIn: 'Counter', value: { kind: 'int', value: 11 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Counter',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [
          { name: 'count', declaredIn: 'Counter', value: { kind: 'int', value: 11 } },
        ],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Counter' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Counter' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-a-obj1',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'a' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'return',
      },
    ],
    delta: {
      operation: 'return',
      description: 'return from <init> — a = obj-1 (id=11)',
      highlightedElements: [{ region: 'stack', elementId: 'frame-0', fieldName: 'a' }],
      newArrows: ['arr-a-obj1'],
      fadingArrows: ['arr-this-1'],
    },
    stdout: [],
  },

  // ── Step 6: new Counter() — second instance, obj-2 ────────────────────────
  {
    stepIndex: 6,
    label: 'new Counter() — obj-2 allocated, count++ → 12, b.id = 12',
    sourceLineNumber: 17,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Counter',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 17,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'a',    value: { kind: 'ref', objectId: 'obj-1' } },
          { slot: 2, name: 'b',    value: { kind: 'ref', objectId: 'obj-2' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Counter',
        fields: [
          { name: 'id', declaredIn: 'Counter', value: { kind: 'int', value: 11 } },
        ],
      },
      {
        objectId: 'obj-2',
        klassName: 'Counter',
        fields: [
          { name: 'id', declaredIn: 'Counter', value: { kind: 'int', value: 12 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Counter',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,  // still true — <clinit> does NOT re-run
        staticFields: [
          { name: 'count', declaredIn: 'Counter', value: { kind: 'int', value: 12 } },
        ],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'main', arity: 1, descriptor: '([Ljava/lang/String;)V', implementedBy: 'Counter' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Counter' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-obj2-klass',
        from: { region: 'heap',      elementId: 'obj-2'   },
        to:   { region: 'metaspace', elementId: 'Counter' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-a-obj1',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'a' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'return',
      },
      {
        id: 'arr-b-obj2',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'b' },
        to:   { region: 'heap',  elementId: 'obj-2' },
        operation: 'return',
      },
    ],
    delta: {
      operation: 'new_object',
      description: 'new Counter() — obj-2 created (id=12); <clinit> skipped (already initialized); both instances share the same static count=12 in Metaspace',
      highlightedElements: [
        { region: 'heap',      elementId: 'obj-2' },
        { region: 'metaspace', elementId: 'Counter', fieldName: 'count' },
      ],
      newArrows: ['arr-obj2-klass', 'arr-b-obj2'],
      fadingArrows: [],
    },
    stdout: [],
  },
];
