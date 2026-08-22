// ─────────────────────────────────────────────────────────────────────────────
// JVM Visualizer — Step type contract
// This file is the ONLY shared interface between engine/ and renderer/.
// The engine produces Step[]; the renderer consumes Step[].
// Neither package may import implementation details from the other.
// ─────────────────────────────────────────────────────────────────────────────

// ── Values ───────────────────────────────────────────────────────────────────

export type PrimitiveValue =
  | { kind: 'int';         value: number  }
  | { kind: 'long';        value: number  }
  | { kind: 'double';      value: number  }
  | { kind: 'float';       value: number  }
  | { kind: 'boolean';     value: boolean }
  | { kind: 'char';        value: string  }
  | { kind: 'null'                        }
  | { kind: 'uninitialized'               }; // declared but not yet assigned

export type Value =
  | PrimitiveValue
  | { kind: 'ref'; objectId: string };       // stable heap reference

// ── Thread & Synchronization (Phase 2) ───────────────────────────────────────

export type MarkWordState =
  | 'unlocked'
  | { kind: 'thin-locked'; threadId: string }
  | { kind: 'fat-locked'; threadId: string };

export interface MonitorState {
  owner:       string;       // threadId holding the lock
  depth:       number;       // reentrant lock depth
  waitQueue:   string[];     // threadIds waiting for this lock
  acquiredAt:  number;       // step index when first acquired
}

export type ThreadStatus = 'CREATED' | 'RUNNABLE' | 'WAITING_ON_LOCK' | 'TERMINATED';

// ── Stack ────────────────────────────────────────────────────────────────────

export interface LocalVar {
  slot:  number;
  name:  string;
  value: Value;
}

export interface StackFrame {
  frameId:      string;      // stable id across steps, e.g. "frame-3"
  threadId?:    string;      // NEW (Phase 2): which thread owns this frame (optional for now)
  className:    string;
  methodName:   string;
  descriptor:   string;      // JVM descriptor e.g. "(ILjava/lang/String;)V"
  lineNumber:   number | null;
  locals:       LocalVar[];
  operandStack: Value[];     // index 0 = bottom
}

// ── Heap ─────────────────────────────────────────────────────────────────────

export interface FieldSlot {
  name:       string;
  declaredIn: string;  // class that declared this field (needed for inherited fields)
  value:      Value;
  isVolatile?: boolean; // true if field was declared volatile
}

export interface HeapObject {
  objectId:  string;              // opaque stable id, e.g. "obj-1" — never a fake address
  klassName: string;              // logical pointer → KlassInfo.klassName in metaspace
  fields:    FieldSlot[];
  markWord?: MarkWordState;       // NEW (Phase 2): lock state of this object (optional for now)
  monitor?:  MonitorState | null; // NEW (Phase 2): monitor info if locked (optional for now)
}

// ── Metaspace ────────────────────────────────────────────────────────────────

export interface VTableSlot {
  slot:          number;
  methodName:    string;
  arity:         number;  // param count — distinguishes overloaded methods
  descriptor:    string;
  implementedBy: string;  // concrete class providing this impl
}

export interface ITableEntry {
  interfaceName: string;
  slots:         VTableSlot[];
}

export interface KlassInfo {
  klassName:      string;
  superKlassName: string | null;
  interfaces:     string[];
  isInterface:    boolean;
  isInitialized:  boolean;  // false until <clinit> completes
  staticFields:   FieldSlot[];
  vtable:         VTableSlot[];
  itable:         ITableEntry[];
}

// ── Operations & Arrows ──────────────────────────────────────────────────────

export type Region = 'stack' | 'heap' | 'metaspace';

export type OperationType =
  | 'invokevirtual'
  | 'invokestatic'
  | 'invokeinterface'
  | 'invokespecial'       // constructor / super calls
  | 'new_object'
  | 'putfield'
  | 'getfield'
  | 'putstatic'
  | 'getstatic'
  | 'return'
  | 'clinit'
  | 'klass_pointer_follow'
  | 'vtable_lookup'
  | 'itable_lookup'
  | 'throw'
  | 'catch'
  | 'monitor_enter'       // NEW (Phase 2): acquire lock
  | 'monitor_exit';       // NEW (Phase 2): release lock

export interface ArrowEndpoint {
  region:     Region;
  elementId:  string;   // objectId | klassName | frameId
  fieldName?: string;   // when arrow targets/originates from a specific field
}

/** A directed logical connection rendered as an SVG arrow.
 *  DOM coordinates are computed by the renderer from elementId;
 *  the engine provides only logical endpoints. */
export interface Arrow {
  id:        string;
  from:      ArrowEndpoint;
  to:        ArrowEndpoint;
  operation: OperationType;
  label?:    string;  // only when src+target alone is ambiguous, e.g. "klass ptr"
}

// ── Delta — what changed on this step ────────────────────────────────────────

export interface HighlightTarget {
  region:     Region;
  elementId:  string;
  fieldName?: string;
}

export interface MonitorOperation {
  kind:      'monitor_enter' | 'monitor_exit';
  objectId:  string;
  threadId:  string;
  markWord:  MarkWordState;
}

export interface MethodInvocation {
  klassName:     string;        // Metaspace class where method lives
  methodName:    string;
  frameId:       string;        // newly created stack frame
  operationType: OperationType; // invokevirtual | invokestatic | invokespecial | invokeinterface
}

export interface Delta {
  operation:           OperationType;
  description:         string;           // human-readable caption
  highlightedElements: HighlightTarget[]; // elements that pulse on entry
  newArrows:           string[];          // arrow ids that appear this step
  fadingArrows:        string[];          // arrow ids that fade out this step
  monitorOperation?:   MonitorOperation;  // NEW (Phase 2): lock acquire/release
  methodInvoked?:      MethodInvocation;  // NEW (Phase 5a): method dispatch arrow
}

// ── Step — the full contract ──────────────────────────────────────────────────

export interface Step {
  stepIndex:        number;
  label:            string;        // short title, e.g. "invokevirtual Dog.speak()"
  sourceLineNumber: number | null;

  stack:     StackFrame[];  // index 0 = bottom (oldest) frame
  heap:      HeapObject[];
  metaspace: KlassInfo[];

  /** All arrows visible on this step — renderer is stateless per step */
  arrows: Arrow[];

  /** null only for step 0 (initial loaded state) */
  delta: Delta | null;

  /** Accumulated stdout up to and including this step */
  stdout: string[];

  // NEW (Phase 2): Thread state (optional for now)
  activeThreadId?:    string;                        // which thread owns this step
  threadStates?:      Map<string, ThreadStatus>;     // status of all threads
}
