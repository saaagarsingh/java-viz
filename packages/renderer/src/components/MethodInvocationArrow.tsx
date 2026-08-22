import { useEffect, useRef, useState, useCallback } from 'react';
import type { Step } from '@jvm-viz/engine';

interface Props {
  currentStep: Step;
  containerRef: React.RefObject<HTMLElement | null>;
}

interface ComputedInvocationArrow {
  x1: number; y1: number;
  x2: number; y2: number;
  isFading: boolean;
}

/** Get the centre point of a DOM element relative to the container */
function centre(el: Element, container: Element): { x: number; y: number } | null {
  const er = el.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  return {
    x: er.left + er.width  / 2 - cr.left,
    y: er.top  + er.height / 2 - cr.top,
  };
}

/**
 * Clamp an arrow endpoint to the border of its target element (4px inset).
 * We project the line endpoint onto the element's border box.
 */
function clampToBorder(
  ax: number, ay: number,  // arrow start (other end)
  bx: number, by: number,  // target centre
  el: Element,
  container: Element,
  inset = 4
): { x: number; y: number } {
  const er = el.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  const left   = er.left   - cr.left + inset;
  const right  = er.right  - cr.left - inset;
  const top    = er.top    - cr.top  + inset;
  const bottom = er.bottom - cr.top  - inset;

  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return { x: bx, y: by };

  const candidates: { t: number; x: number; y: number }[] = [];
  const tryT = (t: number) => {
    const x = ax + dx * t;
    const y = ay + dy * t;
    if (x >= left - 1 && x <= right + 1 && y >= top - 1 && y <= bottom + 1) {
      candidates.push({ t, x, y });
    }
  };
  if (dx !== 0) { tryT((left  - ax) / dx); tryT((right  - ax) / dx); }
  if (dy !== 0) { tryT((top   - ay) / dy); tryT((bottom - ay) / dy); }

  if (candidates.length === 0) return { x: bx, y: by };
  const best = candidates
    .filter(c => c.t > 0.01)
    .sort((a, b) => a.t - b.t)[0];
  return best ? { x: best.x, y: best.y } : { x: bx, y: by };
}

/**
 * MethodInvocationArrow — visualizes the method lookup chain
 *
 * When a method is invoked (step N with delta.methodInvoked), we draw an arrow
 * from the method location in Metaspace → the newly created StackFrame.
 *
 * Arrow appears on step N (dispatch step) and fades out on step N+1.
 * This helps users understand that methods "live" in Metaspace and are
 * "called from" Metaspace to create a frame on the Stack.
 */
export function MethodInvocationArrow({ currentStep, containerRef }: Props) {
  const [computed, setComputed] = useState<ComputedInvocationArrow | null>(null);
  const rafRef = useRef<number | null>(null);

  const compute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only show on steps where a method was invoked
    if (!currentStep.delta?.methodInvoked) {
      setComputed(null);
      return;
    }

    const { klassName, methodName, frameId } = currentStep.delta.methodInvoked;

    // Find the method element in Metaspace (if it exists)
    // For regular methods: id = `method-${klassName}-${methodName}`
    // For constructors: id = `klass-${klassName}` (target the class itself)
    let methodEl: Element | null = null;
    
    if (methodName === '<init>') {
      // Constructor: target the klass card
      methodEl = document.getElementById(`klass-${klassName}`);
    } else {
      // Regular method: target the vtable row
      methodEl = document.getElementById(`method-${klassName}-${methodName}`);
    }

    // Find the new stack frame
    const frameEl = document.getElementById(`frame-${frameId}`);

    if (!methodEl || !frameEl) {
      setComputed(null);
      return;
    }

    const fromCentre = centre(methodEl, container);
    const toCentre   = centre(frameEl, container);
    if (!fromCentre || !toCentre) {
      setComputed(null);
      return;
    }

    // Clamp endpoints to element borders
    const end   = clampToBorder(fromCentre.x, fromCentre.y, toCentre.x,   toCentre.y,   frameEl,   container);
    const start = clampToBorder(toCentre.x,   toCentre.y,   fromCentre.x, fromCentre.y, methodEl, container);

    setComputed({
      x1: start.x, y1: start.y,
      x2: end.x,   y2: end.y,
      isFading: false,
    });
  }, [currentStep, containerRef]);

  // Recompute on step change
  useEffect(() => {
    rafRef.current = requestAnimationFrame(compute);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [compute]);

  // Recompute on resize/scroll
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(compute);
    });
    const container = containerRef.current;
    if (container) ro.observe(container);

    const handleScroll = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(compute);
    };
    if (container) container.addEventListener('scroll', handleScroll, true);

    return () => {
      ro.disconnect();
      if (container) container.removeEventListener('scroll', handleScroll, true);
    };
  }, [compute, containerRef]);

  if (!computed) return null;

  const { x1, y1, x2, y2, isFading } = computed;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0 ? -dy / len : 0;
  const ny = len > 0 ?  dx / len : 0;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const curve = len < 80 ? 40 : 20;
  const cpx = mx + nx * curve;
  const cpy = my + ny * curve;

  const pathD = `M${x1},${y1} Q${cpx},${cpy} ${x2},${y2}`;

  return (
    <svg className="method-invocation-arrow" aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <defs>
        {/* Method invocation arrowhead — distinct from regular arrows */}
        <marker id="arrow-method" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#6366F1" />
        </marker>
      </defs>

      <path
        d={pathD}
        fill="none"
        stroke="#6366F1"
        strokeWidth={2.5}
        markerEnd="url(#arrow-method)"
        style={{
          opacity: isFading ? 0 : 0.8,
          transition: `opacity 200ms ease`,
          filter: 'drop-shadow(0 0 3px rgba(99, 102, 241, 0.3))',
        }}
      />
    </svg>
  );
}
