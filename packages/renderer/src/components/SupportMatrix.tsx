import { useEffect, useRef } from 'react';

interface Props {
  open:    boolean;
  onClose: () => void;
}

// ── Feature lists ─────────────────────────────────────────────────────────────

const SUPPORTED: { label: string; items: string[] }[] = [
  {
    label: 'Types',
    items: [
      'int, long, double, float',
      'boolean, char',
      'String (value-modelled)',
      'Reference types (class/interface)',
    ],
  },
  {
    label: 'Classes & Methods',
    items: [
      'class, abstract class, interface',
      'Single inheritance (extends)',
      'Interface implementation (implements)',
      'Instance + static fields',
      'Constructors + super()',
      'Overloaded constructors (resolved by arity)',
      'Instance methods (virtual dispatch)',
      'Overloaded methods (resolved by arity)',
      'Static methods (invokestatic)',
      'Method overriding (vtable)',
      'Interface dispatch (itable)',
    ],
  },
  {
    label: 'Expressions',
    items: [
      'Arithmetic: + - * / %',
      'Comparison: == != < > <= >=',
      'Logical: && || !',
      'Unary: - ++ --  (prefix & postfix)',
      'Assignment: = += -= *= /= %=',
      'Ternary: condition ? then : else',
      'instanceof type check',
      'String concatenation (+)',
      'new ClassName(args)',
      'this.field, this.method()',
      'ClassName.staticField/method()',
    ],
  },
  {
    label: 'Statements',
    items: [
      'Local variable declarations',
      'if / if-else',
      'while loop',
      'for loop (basic 3-part)',
      'break / continue',
      'synchronized (expr) { ... }',
      'return (with or without value)',
      'System.out.println(...)',
    ],
  },
  {
    label: 'Concurrency (Phase 2/2.1)',
    items: [
      'synchronized instance/static methods',
      'volatile field declaration + visualization',
      'Thread(), Thread(String), Thread(Runnable), Thread(Runnable, String)',
      'Thread.start(), Thread.join(), Thread.join(timeout), Thread.sleep()',
      'Object.wait(), Object.wait(timeout), Object.notify(), Object.notifyAll()',
      'Manual thread stepping: Step Thread / Run All',
      'Thread states: RUNNABLE, WAITING_ON_LOCK, WAITING_ON_THREAD, TERMINATED',
      'Monitor enter/exit + lock badges (thin/fat lock visualization)',
    ],
  },
  {
    label: 'Entry point',
    items: [
      'main(String[] args)  — String[] param silently ignored',
      'public/private/protected modifiers',
    ],
  },
];

const UNSUPPORTED: { label: string; phase: string; items: string[] }[] = [
  {
    label: 'Control flow',
    phase: 'Phase 5',
    items: [
      'Enhanced for-each (for x : list)',
      'switch statement',
      'Labeled break / continue',
    ],
  },
  {
    label: 'Exceptions',
    phase: 'Phase 4',
    items: [
      'throw statement',
      'try / catch / finally',
    ],
  },
  {
    label: 'Type system',
    phase: '—',
    items: [
      'Type casts: (Type) expr',
      'Generics: List<T>',
    ],
  },
  {
    label: 'Arrays',
    phase: 'Phase 5',
    items: [
      'Array creation: new int[n]',
      'Array access: arr[i]',
      'Array parameters / return',
      'Enhanced for-each (for x : arr)',
    ],
  },
  {
    label: 'OOP advanced',
    phase: 'Phase 6',
    items: [
      'Lambda expressions',
      'Anonymous classes',
      'Nested / inner classes',
      'super.method() calls',
    ],
  },
  {
    label: 'Other',
    phase: '—',
    items: [
      'import / package declarations',
      'Multiple vars in one statement',
      'Varargs (...)',
      'Bitwise operators',
      'Records, enums, sealed classes',
    ],
  },
  {
    label: 'Advanced concurrency',
    phase: 'Future scope',
    items: [
      'Real nondeterministic scheduler simulation',
      'Full Java Memory Model / happens-before visibility semantics',
      'java.util.concurrent locks and atomics',
      'Wait/notify spurious wakeups and interruption modeling',
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function SupportMatrix({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Trap focus inside panel when open
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      {/* ── Backdrop ───────────────────────────────────────────── */}
      <div
        className={`support-backdrop${open ? ' support-backdrop--visible' : ''}`}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* ── Sliding panel ──────────────────────────────────────── */}
      <aside
        ref={panelRef}
        className={`support-panel${open ? ' support-panel--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Language support reference"
        tabIndex={-1}
      >
        <div className="support-panel__header">
          <span className="support-panel__title">Language support</span>
          <button
            className="support-panel__close"
            onClick={onClose}
            aria-label="Close language support panel"
          >
            ✕
          </button>
        </div>

        <div className="support-panel__body">
          {/* ── Supported ──────────────────────────────────────── */}
          <section className="support-section support-section--yes">
            <div className="support-section__heading">
              <span className="support-section__icon">✓</span>
              Supported now
            </div>
            {SUPPORTED.map(group => (
              <div key={group.label} className="support-group">
                <div className="support-group__label">{group.label}</div>
                <ul className="support-group__list">
                  {group.items.map(item => (
                    <li key={item} className="support-item support-item--yes">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <div className="support-divider" />

          {/* ── Not supported ──────────────────────────────────── */}
          <section className="support-section support-section--no">
            <div className="support-section__heading">
              <span className="support-section__icon support-section__icon--no">✗</span>
              Not yet supported
            </div>
            {UNSUPPORTED.map(group => (
              <div key={group.label} className="support-group">
                <div className="support-group__label">
                  {group.label}
                  <span className="support-group__phase">{group.phase}</span>
                </div>
                <ul className="support-group__list">
                  {group.items.map(item => (
                    <li key={item} className="support-item support-item--no">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      </aside>
    </>
  );
}
