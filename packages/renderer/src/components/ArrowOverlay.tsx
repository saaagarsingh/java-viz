import { useEffect, useRef, useState, useCallback } from 'react';
import type { Arrow, OperationType } from '@jvm-viz/engine';

interface Props {
  arrows:       Arrow[];
  fadingArrows: string[];
  containerRef: React.RefObject<HTMLElement | null>;
}

interface ComputedArrow {
  id:        string;
  x1: number; y1: number;
  x2: number; y2: number;
  operation: OperationType;
  label:     string | undefined;
  fading:    boolean;
}

/** Map from operation type to SVG stroke style */
function arrowStyle(op: OperationType): {
  stroke: string;
  strokeDasharray?: string;
  markerEnd: string;
  markerStart?: string;
} {
  switch (op) {
    case 'invokevirtual':
    case 'invokeinterface':
      return { stroke: '#94A3B8', markerEnd: 'url(#arrow-filled)' };
    case 'invokestatic':
    case 'invokespecial':
      return { stroke: '#CBD5E1', markerEnd: 'url(#arrow-open)' };
    case 'klass_pointer_follow':
    case 'vtable_lookup':
    case 'itable_lookup':
      return { stroke: '#94A3B8', strokeDasharray: '4 3', markerEnd: 'url(#arrow-open)' };
    case 'getfield':
    case 'getstatic':
    case 'return':
      return { stroke: '#64748B', strokeDasharray: '3 3', markerEnd: 'url(#arrow-hollow)' };
    case 'putfield':
    case 'putstatic':
    case 'new_object':
      return { stroke: '#D97706', markerEnd: 'url(#arrow-write)' };
    default:
      return { stroke: '#94A3B8', markerEnd: 'url(#arrow-filled)' };
  }
}

/** Compute the DOM id for a given arrow endpoint */
function elementDomId(arrow: Arrow, end: 'from' | 'to'): string {
  const ep = end === 'from' ? arrow.from : arrow.to;
  const { region, elementId, fieldName } = ep;

  if (fieldName) {
    if (region === 'stack')     return `local-${elementId}-${fieldName}`;
    if (region === 'heap')      return `field-${elementId}-${fieldName}`;
    if (region === 'metaspace') return `static-${elementId}-${fieldName}`;
  }
  if (region === 'stack')     return `frame-${elementId}`;
  if (region === 'heap')      return `heap-${elementId}`;
  if (region === 'metaspace') return `klass-${elementId}`;
  return elementId;
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

  // Direction from other end to this centre
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return { x: bx, y: by };

  // Find t for each border crossing
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
  // Pick the smallest positive t (first border we hit from ax,ay)
  const best = candidates
    .filter(c => c.t > 0.01)
    .sort((a, b) => a.t - b.t)[0];
  return best ? { x: best.x, y: best.y } : { x: bx, y: by };
}

export function ArrowOverlay({ arrows, fadingArrows, containerRef }: Props) {
  const [computed, setComputed] = useState<ComputedArrow[]>([]);
  const rafRef = useRef<number | null>(null);

  const compute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const results: ComputedArrow[] = [];
    for (const arrow of arrows) {
      const fromId = elementDomId(arrow, 'from');
      const toId   = elementDomId(arrow, 'to');
      const fromEl = document.getElementById(fromId);
      const toEl   = document.getElementById(toId);
      if (!fromEl || !toEl) continue;

      const fromCentre = centre(fromEl, container);
      const toCentre   = centre(toEl,   container);
      if (!fromCentre || !toCentre) continue;

      // Clamp endpoints to element borders
      const end   = clampToBorder(fromCentre.x, fromCentre.y, toCentre.x,   toCentre.y,   toEl,   container);
      const start = clampToBorder(toCentre.x,   toCentre.y,   fromCentre.x, fromCentre.y, fromEl, container);

      results.push({
        id:        arrow.id,
        x1: start.x, y1: start.y,
        x2: end.x,   y2: end.y,
        operation: arrow.operation,
        label:     arrow.label,
        fading:    fadingArrows.includes(arrow.id),
      });
    }
    setComputed(results);
  }, [arrows, fadingArrows, containerRef]);

  // Recompute on mount, step change, and resize
  useEffect(() => {
    // Allow DOM to settle before measuring
    rafRef.current = requestAnimationFrame(compute);
    const ro = new ResizeObserver(() => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(compute);
    });
    const container = containerRef.current;
    if (container) ro.observe(container);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [compute, containerRef]);

  if (computed.length === 0) return null;

  return (
    <svg className="arrow-overlay" aria-hidden="true">
      <defs>
        {/* Filled arrowhead — virtual/interface calls */}
        <marker id="arrow-filled" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#94A3B8" />
        </marker>
        {/* Open arrowhead — static/special */}
        <marker id="arrow-open" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6" fill="none" stroke="#CBD5E1" strokeWidth="1.5" />
        </marker>
        {/* Hollow arrowhead — reads/returns */}
        <marker id="arrow-hollow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6" fill="none" stroke="#64748B" strokeWidth="1.5" />
        </marker>
        {/* Write arrowhead */}
        <marker id="arrow-write" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#D97706" />
        </marker>
      </defs>

      {computed.map(a => {
        const style = arrowStyle(a.operation);
        const mx = (a.x1 + a.x2) / 2;
        const my = (a.y1 + a.y2) / 2;
        // Slight curve for same-region arrows (self-loops and metaspace→metaspace)
        const isSelfRegion = a.x1 === a.x2 && a.y1 === a.y2;
        const dx = a.x2 - a.x1;
        const dy = a.y2 - a.y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        // Perpendicular offset for label clearance
        const nx = len > 0 ? -dy / len : 0;
        const ny = len > 0 ?  dx / len : 0;
        const curve = len < 80 ? 40 : 20;  // tighter curve for short arrows
        const cpx = mx + nx * curve;
        const cpy = my + ny * curve;

        const pathD = isSelfRegion
          ? `M${a.x1},${a.y1} C${a.x1 - 50},${a.y1 - 60} ${a.x2 + 50},${a.y2 - 60} ${a.x2},${a.y2}`
          : `M${a.x1},${a.y1} Q${cpx},${cpy} ${a.x2},${a.y2}`;

        return (
          <g
            key={a.id}
            style={{
              opacity:    a.fading ? 0 : 1,
              transition: `opacity 200ms ease`,
            }}
          >
            <path
              d={pathD}
              fill="none"
              stroke={style.stroke}
              strokeWidth={1.5}
              strokeDasharray={style.strokeDasharray}
              markerEnd={style.markerEnd}
            />
            {a.label && (
              <text
                x={cpx}
                y={cpy - 6}
                fill={style.stroke}
                fontSize={10}
                fontFamily="var(--font-mono)"
                textAnchor="middle"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {a.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
