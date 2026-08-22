import type { Step } from '../types.js';

/**
 * Example 5 — Interface method call (invokeinterface / itable lookup)
 *
 * Java source (illustrative):
 *   interface Greeter {
 *     String greet();
 *   }
 *   class FormalGreeter implements Greeter {
 *     public String greet() { return "Good day."; }
 *   }
 *   class Main {
 *     public static void main(String[] args) {
 *       Greeter g = new FormalGreeter();
 *       System.out.println(g.greet()); // invokeinterface
 *     }
 *   }
 *
 * Key concepts shown:
 *  - invokeinterface vs invokevirtual: different lookup mechanism
 *  - itable entry on FormalGreeter for Greeter interface
 *  - contrast: vtable slot is fixed for class hierarchy; itable lookup
 *    searches interface slots because a class can implement many interfaces
 */
export const invokeInterface: Step[] = [
  // ── Step 0: main begins — Greeter, FormalGreeter loaded ───────────────────
  {
    stepIndex: 0,
    label: 'main() begins — Greeter interface and FormalGreeter loaded',
    sourceLineNumber: 12,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 12,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'Greeter',
        superKlassName: null,
        interfaces: [],
        isInterface: true,
        isInitialized: true,
        staticFields: [],
        vtable: [],
        itable: [],
      },
      {
        klassName: 'FormalGreeter',
        superKlassName: 'Object',
        interfaces: ['Greeter'],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
        ],
        itable: [
          {
            interfaceName: 'Greeter',
            slots: [
              { slot: 0, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
            ],
          },
        ],
      },
    ],
    arrows: [],
    delta: null,
    stdout: [],
  },

  // ── Step 1: new FormalGreeter() — obj-1 allocated ─────────────────────────
  {
    stepIndex: 1,
    label: 'new FormalGreeter() — obj-1 allocated',
    sourceLineNumber: 13,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 13,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'g',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'FormalGreeter',
        fields: [],
      },
    ],
    metaspace: [
      {
        klassName: 'Greeter',
        superKlassName: null,
        interfaces: [],
        isInterface: true,
        isInitialized: true,
        staticFields: [],
        vtable: [],
        itable: [],
      },
      {
        klassName: 'FormalGreeter',
        superKlassName: 'Object',
        interfaces: ['Greeter'],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
        ],
        itable: [
          {
            interfaceName: 'Greeter',
            slots: [
              { slot: 0, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
            ],
          },
        ],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'          },
        to:   { region: 'metaspace', elementId: 'FormalGreeter'  },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-g-obj1',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'g' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'return',
      },
    ],
    delta: {
      operation: 'new_object',
      description: 'new FormalGreeter() — g (declared Greeter) holds ref to obj-1 (runtime: FormalGreeter)',
      highlightedElements: [{ region: 'heap', elementId: 'obj-1' }],
      newArrows: ['arr-obj1-klass', 'arr-g-obj1'],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 2: invokeinterface — klass ptr follow ─────────────────────────────
  {
    stepIndex: 2,
    label: 'invokeinterface g.greet() — step 1: klass ptr → FormalGreeter',
    sourceLineNumber: 14,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 14,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'g',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'FormalGreeter',
        fields: [],
      },
    ],
    metaspace: [
      {
        klassName: 'Greeter',
        superKlassName: null,
        interfaces: [],
        isInterface: true,
        isInitialized: true,
        staticFields: [],
        vtable: [],
        itable: [],
      },
      {
        klassName: 'FormalGreeter',
        superKlassName: 'Object',
        interfaces: ['Greeter'],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
        ],
        itable: [
          {
            interfaceName: 'Greeter',
            slots: [
              { slot: 0, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
            ],
          },
        ],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'         },
        to:   { region: 'metaspace', elementId: 'FormalGreeter' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-g-obj1',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'g' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'return',
      },
    ],
    delta: {
      operation: 'klass_pointer_follow',
      description: 'invokeinterface: JVM reads klass ptr from obj-1 → FormalGreeter in Metaspace',
      highlightedElements: [
        { region: 'heap',      elementId: 'obj-1'         },
        { region: 'metaspace', elementId: 'FormalGreeter' },
      ],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 3: itable lookup — Greeter slot 0 ────────────────────────────────
  {
    stepIndex: 3,
    label: 'invokeinterface — step 2: itable search for Greeter.greet slot 0',
    sourceLineNumber: 14,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 14,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'g',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'FormalGreeter',
        fields: [],
      },
    ],
    metaspace: [
      {
        klassName: 'Greeter',
        superKlassName: null,
        interfaces: [],
        isInterface: true,
        isInitialized: true,
        staticFields: [],
        vtable: [],
        itable: [],
      },
      {
        klassName: 'FormalGreeter',
        superKlassName: 'Object',
        interfaces: ['Greeter'],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
        ],
        itable: [
          {
            interfaceName: 'Greeter',
            slots: [
              { slot: 0, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
            ],
          },
        ],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'         },
        to:   { region: 'metaspace', elementId: 'FormalGreeter' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-g-obj1',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'g' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'return',
      },
      {
        id: 'arr-itable-lookup',
        from: { region: 'metaspace', elementId: 'FormalGreeter' },
        to:   { region: 'metaspace', elementId: 'Greeter'        },
        operation: 'itable_lookup',
        label: 'itable[Greeter][0]',
      },
    ],
    delta: {
      operation: 'itable_lookup',
      description: 'invokeinterface: JVM searches FormalGreeter\'s itable for Greeter entry, slot 0 → FormalGreeter.greet — unlike vtable, itable requires a search because a class can implement multiple interfaces',
      highlightedElements: [{ region: 'metaspace', elementId: 'FormalGreeter' }],
      newArrows: ['arr-itable-lookup'],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 4: FormalGreeter.greet() frame pushed and returns ────────────────
  {
    stepIndex: 4,
    label: 'FormalGreeter.greet() returns "Good day." — output printed',
    sourceLineNumber: 14,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 14,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'g',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'FormalGreeter',
        fields: [],
      },
    ],
    metaspace: [
      {
        klassName: 'Greeter',
        superKlassName: null,
        interfaces: [],
        isInterface: true,
        isInitialized: true,
        staticFields: [],
        vtable: [],
        itable: [],
      },
      {
        klassName: 'FormalGreeter',
        superKlassName: 'Object',
        interfaces: ['Greeter'],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
        ],
        itable: [
          {
            interfaceName: 'Greeter',
            slots: [
              { slot: 0, methodName: 'greet', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'FormalGreeter' },
            ],
          },
        ],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'         },
        to:   { region: 'metaspace', elementId: 'FormalGreeter' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
      {
        id: 'arr-g-obj1',
        from: { region: 'stack', elementId: 'frame-0', fieldName: 'g' },
        to:   { region: 'heap',  elementId: 'obj-1' },
        operation: 'return',
      },
    ],
    delta: {
      operation: 'return',
      description: 'FormalGreeter.greet() returns "Good day." — itable lookup resolved to correct impl',
      highlightedElements: [],
      newArrows: [],
      fadingArrows: ['arr-itable-lookup'],
    },
    stdout: ['Good day.'],
  },
];
