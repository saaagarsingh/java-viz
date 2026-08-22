import type { Step } from '../types.js';

/**
 * Example 3 — Single inheritance with vtable dispatch (invokevirtual)
 *
 * Java source (illustrative):
 *   class Animal {
 *     String name;
 *     Animal(String name) { this.name = name; }
 *     String speak() { return "..."; }
 *   }
 *   class Dog extends Animal {
 *     Dog(String name) { super(name); }
 *     @Override String speak() { return "Woof"; }
 *   }
 *   class Main {
 *     public static void main(String[] args) {
 *       Animal a = new Dog("Rex");
 *       System.out.println(a.speak()); // invokevirtual → Dog.speak()
 *     }
 *   }
 *
 * Key concepts shown:
 *  - vtable built for Dog: Animal.speak slot overridden by Dog.speak
 *  - invokevirtual: follow klass ptr → vtable lookup → dispatch to Dog.speak
 *  - reference type is Animal, but runtime type is Dog
 */
export const vtableDispatch: Step[] = [
  // ── Step 0: main begins, both klasses loaded ───────────────────────────────
  {
    stepIndex: 0,
    label: 'main() begins — Animal and Dog loaded into Metaspace',
    sourceLineNumber: 16,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 16,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [],
    metaspace: [
      {
        klassName: 'Animal',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Animal' },
        ],
        itable: [],
      },
      {
        klassName: 'Dog',
        superKlassName: 'Animal',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          // slot 3 overridden: implementedBy changes from Animal → Dog
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Dog' },
        ],
        itable: [],
      },
    ],
    arrows: [],
    delta: null,
    stdout: [],
  },

  // ── Step 1: new Dog("Rex") — obj-1 allocated ──────────────────────────────
  {
    stepIndex: 1,
    label: 'new Dog("Rex") — obj-1 allocated on heap',
    sourceLineNumber: 16,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 16,
        locals: [{ slot: 0, name: 'args', value: { kind: 'null' } }],
        threadId: 'main',
        operandStack: [],
      },
      {
        frameId: 'frame-1',
        className: 'Dog',
        methodName: '<init>',
        descriptor: '(Ljava/lang/String;)V',
        lineNumber: 8,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
          { slot: 1, name: 'name', value: { kind: 'ref', objectId: 'str-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Dog',
        fields: [
          { name: 'name', declaredIn: 'Animal', value: { kind: 'ref', objectId: 'str-1' } },
        ],
      },
      {
        objectId: 'str-1',
        klassName: 'String',
        fields: [
          { name: 'value', declaredIn: 'String', value: { kind: 'char', value: 'Rex' } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Animal',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Animal' },
        ],
        itable: [],
      },
      {
        klassName: 'Dog',
        superKlassName: 'Animal',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Dog' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Dog'   },
        operation: 'klass_pointer_follow',
        label: 'klass ptr',
      },
    ],
    delta: {
      operation: 'new_object',
      description: 'new Dog("Rex") — obj-1 allocated, Dog.<init> calls super Animal.<init>, name field set',
      highlightedElements: [{ region: 'heap', elementId: 'obj-1' }],
      newArrows: ['arr-obj1-klass'],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 2: constructor returns — a = obj-1 ───────────────────────────────
  {
    stepIndex: 2,
    label: 'return from Dog.<init> — a holds ref to obj-1 (runtime type: Dog)',
    sourceLineNumber: 16,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 16,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'a',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Dog',
        fields: [
          { name: 'name', declaredIn: 'Animal', value: { kind: 'ref', objectId: 'str-1' } },
        ],
      },
      {
        objectId: 'str-1',
        klassName: 'String',
        fields: [
          { name: 'value', declaredIn: 'String', value: { kind: 'char', value: 'Rex' } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Animal',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Animal' },
        ],
        itable: [],
      },
      {
        klassName: 'Dog',
        superKlassName: 'Animal',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Dog' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Dog'   },
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
      description: 'return — local `a` (declared Animal) now references obj-1 whose runtime klass is Dog',
      highlightedElements: [{ region: 'stack', elementId: 'frame-0', fieldName: 'a' }],
      newArrows: ['arr-a-obj1'],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 3: invokevirtual a.speak() — klass-ptr follow ────────────────────
  {
    stepIndex: 3,
    label: 'invokevirtual a.speak() — step 1: follow klass pointer to Dog',
    sourceLineNumber: 17,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 17,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'a',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Dog',
        fields: [
          { name: 'name', declaredIn: 'Animal', value: { kind: 'ref', objectId: 'str-1' } },
        ],
      },
      {
        objectId: 'str-1',
        klassName: 'String',
        fields: [
          { name: 'value', declaredIn: 'String', value: { kind: 'char', value: 'Rex' } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Animal',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Animal' },
        ],
        itable: [],
      },
      {
        klassName: 'Dog',
        superKlassName: 'Animal',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Dog' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Dog'   },
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
      operation: 'klass_pointer_follow',
      description: 'invokevirtual: JVM reads klass pointer from obj-1 header → lands on Dog in Metaspace',
      highlightedElements: [
        { region: 'heap',      elementId: 'obj-1' },
        { region: 'metaspace', elementId: 'Dog'   },
      ],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 4: vtable lookup — slot 3 → Dog.speak ────────────────────────────
  {
    stepIndex: 4,
    label: 'invokevirtual — step 2: vtable[3] → Dog.speak()',
    sourceLineNumber: 17,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 17,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'a',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Dog',
        fields: [
          { name: 'name', declaredIn: 'Animal', value: { kind: 'ref', objectId: 'str-1' } },
        ],
      },
      {
        objectId: 'str-1',
        klassName: 'String',
        fields: [
          { name: 'value', declaredIn: 'String', value: { kind: 'char', value: 'Rex' } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Animal',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Animal' },
        ],
        itable: [],
      },
      {
        klassName: 'Dog',
        superKlassName: 'Animal',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Dog' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Dog'   },
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
        id: 'arr-vtable-lookup',
        from: { region: 'metaspace', elementId: 'Dog' },
        to:   { region: 'metaspace', elementId: 'Dog' },
        operation: 'vtable_lookup',
        label: 'vtable[3] → Dog.speak',
      },
    ],
    delta: {
      operation: 'vtable_lookup',
      description: 'vtable lookup: slot 3 (speak) in Dog\'s vtable → implementedBy: Dog (not Animal) — this is why the override is dispatched',
      highlightedElements: [{ region: 'metaspace', elementId: 'Dog' }],
      newArrows: ['arr-vtable-lookup'],
      fadingArrows: [],
    },
    stdout: [],
  },

  // ── Step 5: Dog.speak() frame pushed ──────────────────────────────────────
  {
    stepIndex: 5,
    label: 'Dog.speak() frame pushed — executing override',
    sourceLineNumber: 11,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 17,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'a',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
      {
        frameId: 'frame-2',
        className: 'Dog',
        methodName: 'speak',
        descriptor: '()Ljava/lang/String;',
        lineNumber: 11,
        locals: [
          { slot: 0, name: 'this', value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Dog',
        fields: [
          { name: 'name', declaredIn: 'Animal', value: { kind: 'ref', objectId: 'str-1' } },
        ],
      },
      {
        objectId: 'str-1',
        klassName: 'String',
        fields: [
          { name: 'value', declaredIn: 'String', value: { kind: 'char', value: 'Rex' } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Animal',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Animal' },
        ],
        itable: [],
      },
      {
        klassName: 'Dog',
        superKlassName: 'Animal',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Dog' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Dog'   },
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
      operation: 'invokevirtual',
      description: 'invokevirtual dispatched to Dog.speak() — Dog.speak frame pushed (not Animal.speak)',
      highlightedElements: [{ region: 'stack', elementId: 'frame-2' }],
      newArrows: [],
      fadingArrows: ['arr-vtable-lookup'],
    },
    stdout: [],
  },

  // ── Step 6: return "Woof" — output printed ────────────────────────────────
  {
    stepIndex: 6,
    label: 'Dog.speak() returns "Woof" — println output',
    sourceLineNumber: 17,
    stack: [
      {
        frameId: 'frame-0',
        className: 'Main',
        methodName: 'main',
        descriptor: '([Ljava/lang/String;)V',
        lineNumber: 17,
        locals: [
          { slot: 0, name: 'args', value: { kind: 'null' } },
          { slot: 1, name: 'a',    value: { kind: 'ref', objectId: 'obj-1' } },
        ],
        threadId: 'main',
        operandStack: [],
      },
    ],
    heap: [
      {
        objectId: 'obj-1',
        klassName: 'Dog',
        fields: [
          { name: 'name', declaredIn: 'Animal', value: { kind: 'ref', objectId: 'str-1' } },
        ],
      },
      {
        objectId: 'str-1',
        klassName: 'String',
        fields: [
          { name: 'value', declaredIn: 'String', value: { kind: 'char', value: 'Rex' } },
        ],
      },
    ],
    metaspace: [
      {
        klassName: 'Animal',
        superKlassName: 'Object',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Animal' },
        ],
        itable: [],
      },
      {
        klassName: 'Dog',
        superKlassName: 'Animal',
        interfaces: [],
        isInterface: false,
        isInitialized: true,
        staticFields: [],
        vtable: [
          { slot: 0, methodName: 'toString', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
          { slot: 1, methodName: 'equals', arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
          { slot: 2, methodName: 'hashCode', arity: 0, descriptor: '()I', implementedBy: 'Object' },
          { slot: 3, methodName: 'speak', arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Dog' },
        ],
        itable: [],
      },
    ],
    arrows: [
      {
        id: 'arr-obj1-klass',
        from: { region: 'heap',      elementId: 'obj-1' },
        to:   { region: 'metaspace', elementId: 'Dog'   },
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
      description: 'Dog.speak() returns "Woof" — note Animal.speak slot 3 was never called',
      highlightedElements: [],
      newArrows: [],
      fadingArrows: [],
    },
    stdout: ['Woof'],
  },
];
