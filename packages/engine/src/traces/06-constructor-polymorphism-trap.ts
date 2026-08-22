import type { Step } from '../types.js';

/**
 * Example 6 — Constructor + polymorphism trap
 *
 * Java source (illustrative):
 *   class Base {
 *     int value;
 *     Base() {
 *       this.value = 10;
 *       init();            // DANGER: virtual call during construction
 *     }
 *     void init() { System.out.println("Base.init, value=" + value); }
 *   }
 *   class Derived extends Base {
 *     int extra;
 *     Derived() {
 *       super();           // calls Base(), which calls init() via vtable
 *       this.extra = 99;
 *     }
 *     @Override
 *     void init() { System.out.println("Derived.init, extra=" + extra); }
 *   }
 *   class Main {
 *     public static void main(String[] args) {
 *       new Derived(); // prints: "Derived.init, extra=0" (not 99!)
 *     }
 *   }
 *
 * Key concepts shown:
 *  - The object's klass pointer already points to Derived at allocation time
 *  - So invokevirtual init() inside Base() dispatches to Derived.init()
 *  - But Derived.<init> hasn't run yet — extra is still 0
 *  - This is the classic "leaking `this` from constructor" bug
 */
export const constructorPolymorphismTrap: Step[] = [
  // ── Step 0: main begins ───────────────────────────────────────────────────
  {
    stepIndex: 0,
    label: 'main() begins — Base and Derived loaded',
    sourceLineNumber: 30,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 30,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'Base',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Base'   },
        ],
        itable: [],
      },
      {
        klassName: 'Derived',
        superKlassName: 'Base',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object'  },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          // slot 3 overridden — this is what makes the trap
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Derived' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: null,
    stdout: [],
  },

  // ── Step 1: new Derived() — obj-1 allocated with klass=Derived ───────────
  {
    stepIndex: 1,
    label: 'new Derived() — obj-1 allocated; klass ptr → Derived IMMEDIATELY',
    sourceLineNumber: 30,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 30,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Derived',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 18,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Derived',      // ← already Derived, not Base
        fields: [
          { name: 'value', declaredIn: 'Base',    value: { kind: 'int', value: 0 } },
          { name: 'extra', declaredIn: 'Derived',  value: { kind: 'int', value: 0 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Base',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Base'   },
        ],
        itable: [],
      },
      {
        klassName: 'Derived',
        superKlassName: 'Base',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object'  },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Derived' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Derived' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
    ],
    delta: {
      operation: 'new_object',
      description: 'new Derived() — object allocated; klass ptr points to Derived BEFORE any constructor runs — this is what causes the trap',
      highlightedElements: [
        { region: 'heap',      elementId: 'obj-1' },
        { region: 'metaspace', elementId: 'Derived' },
      ],
      newArrows: ['arr-obj1-klass'],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 2: Derived.<init> calls super() — Base.<init> frame pushed ────────
  {
    stepIndex: 2,
    label: 'Derived.<init> calls super() — Base.<init> frame pushed',
    sourceLineNumber: 18,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 30,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Derived',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 18,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
      {
        frameId: 'frame-2',
        className: 'Base',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 5,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Derived',
        fields: [
          { name: 'value', declaredIn: 'Base',    value: { kind: 'int', value: 0 } },
          { name: 'extra', declaredIn: 'Derived',  value: { kind: 'int', value: 0 } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Base',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Base'   },
        ],
        itable: [],
      },
      {
        klassName: 'Derived',
        superKlassName: 'Base',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object'  },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Derived' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Derived' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
    ],
    delta: {
      operation: 'invokespecial',
      description: 'invokespecial super() — Base.<init> frame pushed; same obj-1, same klass ptr (Derived)',
      highlightedElements: [{ region: 'stack', elementId: 'frame-2' }],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 3: Base.<init> sets value = 10, then calls init() ───────────────
  {
    stepIndex: 3,
    label: 'Base.<init>: value = 10, then invokevirtual init()',
    sourceLineNumber: 5,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 30,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Derived',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 18,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
      {
        frameId: 'frame-2',
        className: 'Base',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 5,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Derived',
        fields: [
          { name: 'value', declaredIn: 'Base',    value: { kind: 'int', value: 10 } },  // ← written
          { name: 'extra', declaredIn: 'Derived',  value: { kind: 'int', value: 0  } },  // ← still 0!
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Base',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Base'   },
        ],
        itable: [],
      },
      {
        klassName: 'Derived',
        superKlassName: 'Base',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object'  },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Derived' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Derived' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
    ],
    delta: {
      operation: 'putfield',
      description: 'Base.<init> sets this.value = 10; now Base.<init> calls invokevirtual this.init()',
      highlightedElements: [{ region: 'heap', elementId: 'obj-1', fieldName: 'value' }],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 4: invokevirtual init() — klass ptr → Derived → vtable[3] = Derived.init ──
  {
    stepIndex: 4,
    label: 'invokevirtual init() inside Base.<init> → dispatches to Derived.init!',
    sourceLineNumber: 6,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 30,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Derived',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 18,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
      {
        frameId: 'frame-2',
        className: 'Base',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 6,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
      {
        frameId: 'frame-3',
        className: 'Derived',
        methodName: 'init',
        descriptor: '()V',
        lineNumber: 24,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Derived',
        fields: [
          { name: 'value', declaredIn: 'Base',    value: { kind: 'int', value: 10 } },
          { name: 'extra', declaredIn: 'Derived',  value: { kind: 'int', value: 0  } },  // ← still 0 — trap!
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Base',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Base'   },
        ],
        itable: [],
      },
      {
        klassName: 'Derived',
        superKlassName: 'Base',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object'  },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Derived' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Derived' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
    ],
    delta: {
      operation: 'invokevirtual',
      description: 'THE TRAP: invokevirtual inside Base.<init> follows klass ptr → Derived → vtable[3] = Derived.init — Derived.init runs with extra=0 because Derived.<init> hasn\'t set it yet',
      highlightedElements: [
        { region: 'stack',     elementId: 'frame-3' },
        { region: 'heap',      elementId: 'obj-1', fieldName: 'extra' },
        { region: 'metaspace', elementId: 'Derived' },
      ],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 5: Derived.init prints extra=0 ───────────────────────────────────
  {
    stepIndex: 5,
    label: 'Derived.init prints "Derived.init, extra=0" — extra is 0, not 99',
    sourceLineNumber: 24,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 30,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Derived',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 18,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
      {
        frameId: 'frame-2',
        className: 'Base',
        methodName: '<init>',
        descriptor: '()V',
        lineNumber: 6,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Derived',
        fields: [
          { name: 'value', declaredIn: 'Base',    value: { kind: 'int', value: 10 } },
          { name: 'extra', declaredIn: 'Derived',  value: { kind: 'int', value: 0  } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Base',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Base'   },
        ],
        itable: [],
      },
      {
        klassName: 'Derived',
        superKlassName: 'Base',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object'  },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Derived' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Derived' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
    ],
    delta: {
      operation: 'return',
      description: 'Derived.init returns and outputs "Derived.init, extra=0" — printing the un-initialized value',
      highlightedElements: [],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: ['Derived.init, extra=0'],
  },

  // ── Step 6: Base.<init> returns, Derived.<init> sets extra = 99 ───────────
  {
    stepIndex: 6,
    label: 'Derived.<init> sets extra = 99 — too late, init() already ran',
    sourceLineNumber: 30,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 30,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Derived',
        fields: [
          { name: 'value', declaredIn: 'Base',    value: { kind: 'int', value: 10 } },
          { name: 'extra', declaredIn: 'Derived',  value: { kind: 'int', value: 99 } },  // ← set now
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Base',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Base'   },
        ],
        itable: [],
      },
      {
        klassName: 'Derived',
        superKlassName: 'Base',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', descriptor: '()Ljava/lang/String;', implementedBy: 'Object'  },
          { slot: 1, methodName: 'equals',   descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', descriptor: '()I',                   implementedBy: 'Object' },
          { slot: 3, methodName: 'init',     descriptor: '()V',                   implementedBy: 'Derived' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1'   },
        to:   { region: 'metaspace', elementId: 'Derived' },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
    ],
    delta: {
      operation: 'putfield',
      description: 'Derived.<init> finally sets extra = 99 — but init() already observed extra=0. This is the constructor polymorphism bug.',
      highlightedElements: [{ region: 'heap', elementId: 'obj-1', fieldName: 'extra' }],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: ['Derived.init, extra=0'],
  },
];
