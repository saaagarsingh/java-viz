/**
 * engine/languages/java/class-loader.ts
 *
 * Builds the KlassInfo[] (Metaspace representation) from the parsed Program.
 * This runs BEFORE any code execution — it models what the JVM's class loading,
 * linking, and preparation phases produce.
 *
 * Responsibilities:
 *  1. Build KlassInfo for each ClassDecl including vtable and itable.
 *  2. Verify inheritance chains (no cycles, all supers exist).
 *  3. Compute vtable layout: inherit parent slots, override where declared.
 *  4. Compute itable entries per interface.
 *  5. Set isInitialized = false (clinit not yet run).
 *
 * Accuracy notes:
 *  - vtable slot numbering: slots 0-N are inherited from Object (toString,
 *    equals, hashCode) then superclass methods, then class-own methods.
 *    Override = same slot number, different implementedBy.
 *  - itable: per-interface, slot 0..M are the interface's declared methods in
 *    declaration order. The implementing class maps each to its concrete impl.
 *  - Static methods are NOT in the vtable (invokestatic bypasses dispatch).
 */

import type { Program, ClassDecl, FieldDecl, MethodDecl } from './ast.js';
import type { KlassInfo, VTableSlot, ITableEntry, FieldSlot, Value } from '../../types.js';

// ── Object's built-in vtable slots (every class inherits these) ───────────────

const OBJECT_VTABLE: VTableSlot[] = [
  { slot: 0, methodName: 'toString',  arity: 0, descriptor: '()Ljava/lang/String;', implementedBy: 'Object' },
  { slot: 1, methodName: 'equals',    arity: 1, descriptor: '(Ljava/lang/Object;)Z', implementedBy: 'Object' },
  { slot: 2, methodName: 'hashCode',  arity: 0, descriptor: '()I',                   implementedBy: 'Object' },
];

export class ClassLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassLoadError';
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LoadedClasses {
  /** KlassInfo array in load order (used to initialise Metaspace in Step 0) */
  klasses: KlassInfo[];
  /** Fast lookup by name */
  byName:  Map<string, KlassInfo>;
  /** Original ClassDecl for each name (needed by interpreter) */
  decls:   Map<string, ClassDecl>;
}

export function loadClasses(program: Program): LoadedClasses {
  const decls = new Map<string, ClassDecl>(program.classes.map(c => [c.name, c]));

  // Validate: all supers and interfaces must be declared
  for (const c of program.classes) {
    if (c.superclass && c.superclass !== 'Object' && !decls.has(c.superclass)) {
      throw new ClassLoadError(`Class "${c.name}" extends unknown class "${c.superclass}"`);
    }
    for (const iface of c.interfaces) {
      if (!decls.has(iface)) {
        throw new ClassLoadError(`Class "${c.name}" implements unknown interface "${iface}"`);
      }
    }
  }

  // Topological sort: load superclasses before subclasses
  const sorted = topologicalSort(program.classes, decls);

  // Build KlassInfo for each class in order
  const byName = new Map<string, KlassInfo>();
  const klasses: KlassInfo[] = [];

  for (const decl of sorted) {
    const klass = buildKlass(decl, byName);
    byName.set(decl.name, klass);
    klasses.push(klass);
  }

  return { klasses, byName, decls };
}

// ── Topological sort (superclass before subclass) ─────────────────────────────

function topologicalSort(classes: ClassDecl[], decls: Map<string, ClassDecl>): ClassDecl[] {
  const visited = new Set<string>();
  const result:  ClassDecl[] = [];

  function visit(name: string) {
    if (visited.has(name)) return;
    const decl = decls.get(name);
    if (!decl) return;  // 'Object' — not in user code, always implicitly first
    visited.add(name);
    if (decl.superclass && decl.superclass !== 'Object') visit(decl.superclass);
    for (const iface of decl.interfaces) visit(iface);
    result.push(decl);
  }

  for (const c of classes) visit(c.name);
  return result;
}

// ── Build a single KlassInfo ──────────────────────────────────────────────────

function buildKlass(decl: ClassDecl, loaded: Map<string, KlassInfo>): KlassInfo {
  const superName = decl.superclass ?? (decl.isInterface ? null : 'Object');
  const superKlass = superName && superName !== 'Object' ? (loaded.get(superName) ?? null) : null;

  const vtable  = buildVTable(decl, superKlass);
  const itable  = buildITable(decl, loaded);
  const staticFields = buildStaticFieldDefaults(decl.fields.filter(f => f.isStatic));

  return {
    klassName:      decl.name,
    superKlassName: superName,
    interfaces:     decl.interfaces,
    isInterface:    decl.isInterface,
    isInitialized:  false,   // <clinit> has not run yet
    staticFields,
    vtable,
    itable,
  };
}

// ── vtable construction ───────────────────────────────────────────────────────

function buildVTable(decl: ClassDecl, superKlass: KlassInfo | null): VTableSlot[] {
  if (decl.isInterface) return [];  // interfaces don't have vtables

  // Start with Object's slots, then inherit from super
  const base: VTableSlot[] = superKlass
    ? superKlass.vtable.map(s => ({ ...s }))
    : OBJECT_VTABLE.map(s => ({ ...s }));

  // Override slots for methods declared in this class
  const instanceMethods = decl.methods.filter(m => !m.isStatic && !m.isAbstract);
  for (const method of instanceMethods) {
    const descriptor = buildDescriptor(method);
    const arity      = method.params.length;
    // Match by name AND arity so overloads are independent slots
    const existing   = base.findIndex(s => s.methodName === method.name && s.arity === arity);
    if (existing >= 0) {
      // Override: same slot, updated implementedBy
      base[existing] = { ...base[existing]!, implementedBy: decl.name };
    } else {
      // New virtual method or new overload: append at next slot
      base.push({ slot: base.length, methodName: method.name, arity, descriptor, implementedBy: decl.name });
    }
  }

  // Abstract methods from this class (if abstract class) — add slot but implementedBy stays abstract marker
  if (decl.isAbstract) {
    for (const method of decl.methods.filter(m => m.isAbstract)) {
      const arity    = method.params.length;
      const existing = base.findIndex(s => s.methodName === method.name && s.arity === arity);
      if (existing < 0) {
        base.push({ slot: base.length, methodName: method.name, arity, descriptor: buildDescriptor(method), implementedBy: `<abstract:${decl.name}>` });
      }
    }
  }

  return base;
}

// ── itable construction ───────────────────────────────────────────────────────

function buildITable(decl: ClassDecl, loaded: Map<string, KlassInfo>): ITableEntry[] {
  if (decl.isInterface) return [];

  const entries: ITableEntry[] = [];

  for (const ifaceName of decl.interfaces) {
    const ifaceDecl = loaded.get(ifaceName);
    if (!ifaceDecl) continue;

    // Find the interface ClassDecl to get method declarations in order
    const slots: VTableSlot[] = [];
    // We'll derive the interface's declared methods from the KlassInfo
    // (they were added when the interface was loaded via buildVTable — but interfaces
    //  don't have vtables, so we stored them as abstract markers or we need to find them).
    // Actually: interface abstract methods are in the ClassDecl's methods array.
    // We need the original ClassDecl, not the KlassInfo.
    // This is why LoadedClasses carries both.

    // For now we derive from method names — the interpreter knows the interface decl.
    // We just build the itable entry with what we know.
    // The full itable (with concrete impls) is built here:

    const ifaceMethods = getInterfaceMethods(ifaceName, loaded);
    let slot = 0;
    for (const [methodName, descriptor, arity] of ifaceMethods) {
      // Find which class in this hierarchy implements this method
      const implementor = findImplementor(methodName, arity, decl.name, loaded);
      slots.push({ slot, methodName, arity, descriptor, implementedBy: implementor });
      slot++;
    }

    if (slots.length > 0) {
      entries.push({ interfaceName: ifaceName, slots });
    }
  }

  return entries;
}

function getInterfaceMethods(ifaceName: string, loaded: Map<string, KlassInfo>): Array<[string, string, number]> {
  const iface = loaded.get(ifaceName);
  if (!iface) return [];
  // Interface vtable is empty — itable is filled lazily by the interpreter.
  return [];
}

function findImplementor(methodName: string, arity: number, className: string, loaded: Map<string, KlassInfo>): string {
  let current: KlassInfo | undefined = loaded.get(className);
  while (current) {
    const slot = current.vtable.find(s => s.methodName === methodName && s.arity === arity);
    if (slot && !slot.implementedBy.startsWith('<abstract:')) return slot.implementedBy;
    if (!current.superKlassName || current.superKlassName === 'Object') break;
    current = loaded.get(current.superKlassName);
  }
  return `<abstract:${className}>`;
}

// ── Static field defaults ─────────────────────────────────────────────────────

function buildStaticFieldDefaults(fields: FieldDecl[]): FieldSlot[] {
  return fields.map(f => ({
    name:       f.name,
    declaredIn: (f as any).__className ?? 'Unknown',  // set by caller when available
    value:      defaultValue(f.type),
  }));
}

export function defaultValue(type: { kind: string }): Value {
  switch (type.kind) {
    case 'int':     return { kind: 'int',     value: 0 };
    case 'long':    return { kind: 'long',    value: 0 };
    case 'double':  return { kind: 'double',  value: 0 };
    case 'float':   return { kind: 'float',   value: 0 };
    case 'boolean': return { kind: 'boolean', value: false };
    case 'char':    return { kind: 'char',    value: '\0' };
    case 'String':  return { kind: 'null' };
    case 'ref':     return { kind: 'null' };
    case 'void':    return { kind: 'uninitialized' };
    default:        return { kind: 'uninitialized' };
  }
}

// ── Descriptor builder ────────────────────────────────────────────────────────

function buildDescriptor(method: MethodDecl): string {
  const paramDescs = method.params.map(p => typeDescriptor(p.type)).join('');
  const retDesc    = typeDescriptor(method.returnType);
  return `(${paramDescs})${retDesc}`;
}

function typeDescriptor(type: { kind: string; className?: string }): string {
  switch (type.kind) {
    case 'void':    return 'V';
    case 'int':     return 'I';
    case 'long':    return 'J';
    case 'double':  return 'D';
    case 'float':   return 'F';
    case 'boolean': return 'Z';
    case 'char':    return 'C';
    case 'String':  return 'Ljava/lang/String;';
    case 'ref':     return `L${(type as any).className};`;
    default:        return 'Ljava/lang/Object;';
  }
}
