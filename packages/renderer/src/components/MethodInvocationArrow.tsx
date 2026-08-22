import { useEffect, useRef, useState, useCallback } from 'react';
import type { Step, OperationType } from '@jvm-viz/engine';

interface Props {
  currentStep: Step;
  containerRef: React.RefObject<HTMLElement | null>;
}

interface Segment {
  x1: number; y1: number;
  x2: number; y2: number;
  cpx: number; cpy: number; // bezier control point
}

interface ComputedInvocationArrow {
  segments:      Segment[];
  labelX:        number;
  labelY:        number;
  label:         string;
  operationType: OperationType;
}

/** Arrow colour per operation — distinct from region colours */
const OP_COLOR: Record<string, string> = {
  invokevirtual:  '#6366F1',  // indigo — dispatched via object vtable
  invokestatic:   '#10B981',  // emerald — direct class lookup
  invokespecial:  '#22D3EE',  // cyan — constructor / super (no object lookup)
  invokeinterface:'#8B5CF6',  // violet — interface itable
};

/** Human-readable short label for each operation */
const OP_LABEL: Record<string, string> = {
  invokevirtual:  'invokevirtual',
  invokestatic:   'invokestatic',
  invokespecial:  'invokespecial',
  invokeinterface:'invokeinterface',
};

/** Centre of a DOM element relative to its container */
function centre(el: Element, container: Element): { x: number; y: number } | null {
  const er = el.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  return {
    x: er.left + er.width  / 2 - cr.left,
    y: er.top  + er.height / 2 - cr.top,
  };
}

/**
 * Clamp a point to the nearest border of a DOM element (with inset).
 * Projects the line from (ax,ay) toward target centre (bx,by) onto the border.
 */
function clampToBorder(
  ax: number, ay: number,
  bx: number, by: number,
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
  const best = candidates.filter(c => c.t > 0.01).sort((a, b) => a.t - b.t)[0];
  return best ? { x: best.x, y: best.y } : { x: bx, y: by };
}

/**
 * Build a single bezier segment between two elements.
 * curveSide: +1 curves above/left, -1 below/right — lets us separate
 * overlapping arrows without collision-detecting every pair.
 */
function makeSegment(
  fromEl: Element, toEl: Element, container: Element,
  curveFactor = 28
): Segment | null {
  const fc = centre(fromEl, container);
  const tc = centre(toEl,   container);
  if (!fc || !tc) return null;

  const start = clampToBorder(tc.x, tc.y, fc.x, fc.y, fromEl, container);
  const end   = clampToBorder(fc.x, fc.y, tc.x, tc.y, toEl,   container);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = len > 0 ? -dy / len : 0;
  const ny = len > 0 ?  dx / len : 0;
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  // Offset control point above the path for short segments, moderate bow for long ones
  const bow = Math.min(curveFactor, len * 0.35);

  return {
    x1: start.x, y1: start.y,
    x2: end.x,   y2: end.y,
    cpx: mx + nx * bow,
    cpy: my + ny * bow,
  };
}

/**
 * MethodInvocationArrow — visualizes the method dispatch chain.
 *
 * invokevirtual / invokeinterface — two-segment chain showing the full lookup:
 *   heap object → Metaspace klass card  (klass pointer hop)
 *   Metaspace vtable row → new StackFrame  (dispatch hop)
 *
 * invokestatic — one segment (direct klass → frame; no object involved)
 *
 * invokespecial — one segment (klass → frame; constructor / super call)
 *
 * Arrow is only visible on the dispatch step (delta.methodInvoked present).
 * It disappears on the next step, cleanly communicating "this is the call moment".
 */
export function MethodInvocationArrow({ currentStep, containerRef }: Props) {
  const [computed, setComputed] = useState<ComputedInvocationArrow | null>(null);
  const rafRef = useRef<number | null>(null);

  const compute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const mi = currentStep.delta?.methodInvoked;
    if (!mi) { setComputed(null); return; }

    const { klassName, methodName, frameId, operationType } = mi;

    const frameEl  = document.getElementById(`frame-${frameId}`);
    const klassEl  = document.getElementById(`klass-${klassName}`);
    // For vtable methods use the row; for constructors and static methods fall back to klass card
    const vtableEl = document.getElementById(`method-${klassName}-${methodName}`);
    const methodEl = (methodName === '<init>' || !vtableEl) ? klassEl : vtableEl;

    if (!frameEl || !klassEl || !methodEl) { setComputed(null); return; }

    const isVirtualDispatch =
      operationType === 'invokevirtual' || operationType === 'invokeinterface';

    let segments: Segment[] = [];

    if (isVirtualDispatch) {
      // ── Chain: heapObj → klass card  +  vtable row → stack frame ──────────
      // Find the heap object that holds the reference (the receiver).
      // We grab 'this' from the new frame's locals — its objectId is the receiver.
      const thisLocal = currentStep.stack
        .find(f => f.frameId === frameId)
        ?.locals.find(l => l.name === 'this');
      const heapObjId = thisLocal?.value.kind === 'ref' ? thisLocal.value.objectId : null;
      const heapEl = heapObjId ? document.getElementById(`heap-${heapObjId}`) : null;

      if (heapEl) {
        // Segment 1: heap object → klass card  (klass pointer hop)
        const s1 = makeSegment(heapEl, klassEl, container, 24);
        if (s1) segments.push(s1);
      }

      // Segment 2: vtable row → new stack frame  (dispatch hop)
      const s2 = makeSegment(methodEl, frameEl, container, 36);
      if (s2) segments.push(s2);
    } else {
      // invokestatic / invokespecial: direct klass → frame
      const s = makeSegment(methodEl, frameEl, container, 32);
      if (s) segments.push(s);
    }

    if (segments.length === 0) { setComputed(null); return; }

    // Position label at the mid-control-point of the last (dispatch) segment
    const lastSeg = segments[segments.length - 1]!;
    setComputed({
      segments,
      labelX: lastSeg.cpx,
      labelY: lastSeg.cpy - 10,
      label:  OP_LABEL[operationType] ?? operationType,
      operationType,
    });
  }, [currentStep, containerRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(compute);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [compute]);

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

  const { segments, labelX, labelY, label, operationType } = computed;
  const color   = OP_COLOR[operationType] ?? '#6366F1';
  const markerId = `arrow-method-${operationType}`;

  // Pill dimensions — measured from label length
  const charWidth = 7;
  const pillW = label.length * charWidth + 14;
  const pillH = 16;

  return (
    <svg
      className="method-invocation-arrow"
      aria-hidden="true"
      style={{ pointerEvents: 'none', overflow: 'visible' }}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="8" markerHeight="6"
          refX="7" refY="3" orient="auto"
        >
          <path d="M0,0 L8,3 L0,6 Z" fill={color} />
        </marker>
      </defs>

      {segments.map((seg, i) => {
        const isLastSeg = i === segments.length - 1;
        const pathD = `M${seg.x1},${seg.y1} Q${seg.cpx},${seg.cpy} ${seg.x2},${seg.y2}`;
        return (
          <path
            key={i}
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={isLastSeg ? 2.5 : 1.8}
            strokeDasharray={isLastSeg ? undefined : '5 3'}
            markerEnd={isLastSeg ? `url(#${markerId})` : undefined}
            style={{
              opacity: 0.85,
              filter: isLastSeg
                ? `drop-shadow(0 0 4px ${color}55)`
                : undefined,
            }}
          />
        );
      })}

      {/* Label pill — rendered outside any clipping ancestor via absolute SVG */}
      <rect
        x={labelX - pillW / 2}
        y={labelY - pillH / 2}
        width={pillW}
        height={pillH}
        rx={pillH / 2}
        fill={color}
        opacity={0.15}
      />
      <rect
        x={labelX - pillW / 2}
        y={labelY - pillH / 2}
        width={pillW}
        height={pillH}
        rx={pillH / 2}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.6}
      />
      <text
        x={labelX}
        y={labelY + 4}
        fill={color}
        fontSize={10}
        fontFamily="var(--font-mono)"
        fontWeight="600"
        textAnchor="middle"
        style={{ userSelect: 'none' }}
      >
        {label}
      </text>
    </svg>
  );
}
