import { useState } from 'react';
import type { StackFrame, HighlightTarget, ThreadStatus, HeapObject } from '@jvm-viz/engine';
import { formatValue } from '../utils/formatValue.js';

interface Props {
  frames:        StackFrame[];
  highlights:    HighlightTarget[];
  heap:          HeapObject[];
  threadStates?: Map<string, ThreadStatus>;
}

/** Fixed palette — one color per thread, cycling after 4 */
const THREAD_PALETTE = ['#6366F1', '#22D3EE', '#34D399', '#F472B6'];
const _threadColorMap = new Map<string, string>();
let _colorIdx = 0;

export function threadColor(threadId: string | undefined): string {
  if (!threadId) return THREAD_PALETTE[0]!;
  if (!_threadColorMap.has(threadId)) {
    _threadColorMap.set(threadId, THREAD_PALETTE[_colorIdx % THREAD_PALETTE.length]!);
    _colorIdx++;
  }
  return _threadColorMap.get(threadId)!;
}

function isHighlighted(highlights: HighlightTarget[], frameId: string, field?: string): boolean {
  return highlights.some(
    h => h.region === 'stack' && h.elementId === frameId && (field === undefined || h.fieldName === field)
  );
}

function StatusBadge({ status }: { status: ThreadStatus }) {
  const cls =
    status === 'RUNNABLE'        ? 'thread-badge thread-badge--runnable'   :
    status === 'WAITING_ON_LOCK' ? 'thread-badge thread-badge--waiting'    :
    status === 'TERMINATED'      ? 'thread-badge thread-badge--terminated' :
                                   'thread-badge thread-badge--created';
  const label = status === 'WAITING_ON_LOCK' ? 'WAITING' : status;
  return <span className={cls}>{label}</span>;
}

function FrameCard({
  frame, isTop, highlights, heapIndex,
}: {
  frame: StackFrame; isTop: boolean; highlights: HighlightTarget[];
  heapIndex: Map<string, string>; // objectId → klassName
}) {
  const highlighted = isHighlighted(highlights, frame.frameId);
  const color = threadColor(frame.threadId);
  return (
    <div
      id={`frame-${frame.frameId}`}
      className={`frame-card${isTop ? ' frame-card--top' : ''}${highlighted ? ' is-highlighted' : ''}`}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="frame-card__header">
        <span className="frame-card__method">
          {frame.className}.{frame.methodName}
          <span style={{ opacity: 0.5, fontSize: '10px', marginLeft: 4 }}>{frame.descriptor}</span>
        </span>
        {frame.lineNumber !== null && (
          <span className="frame-card__line">:{frame.lineNumber}</span>
        )}
      </div>
      {frame.locals.length > 0 && (
        <div className="frame-card__body">
          {frame.locals.map(local => {
            const fieldHighlighted = isHighlighted(highlights, frame.frameId, local.name);
            const val    = local.value;
            const refVal = val.kind === 'ref' ? val : null;
            const klassName = refVal ? heapIndex.get(refVal.objectId) : undefined;
            return (
              <div
                key={local.slot}
                id={`local-${frame.frameId}-${local.name}`}
                className={`field-row${fieldHighlighted ? ' is-highlighted-field' : ''}`}
              >
                <span className="field-row__name">{local.name}</span>
                {refVal ? (
                  <span className="field-row__value field-row__value--ref">
                    <span className="ref-arrow">→</span>
                    <span className="ref-klass">
                      {(klassName ?? refVal.objectId)}#{refVal.objectId.replace(/^obj-/, '')}
                    </span>
                  </span>
                ) : (() => {
                  const fmted = formatValue(val);
                  return <span className={`field-row__value ${fmted.cls}`}>{fmted.text}</span>;
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StackPanel({ frames, highlights, heap, threadStates }: Props) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  // Build objectId → klassName index once per render for O(1) ref lookup
  const heapIndex = new Map<string, string>(heap.map(o => [o.objectId, o.klassName]));

  if (frames.length === 0) {
    return <p className="empty-state">Empty stack</p>;
  }

  // Group frames by threadId — preserve insertion order
  const groups = new Map<string, StackFrame[]>();
  for (const frame of frames) {
    const tid = frame.threadId ?? 'main';
    if (!groups.has(tid)) groups.set(tid, []);
    groups.get(tid)!.push(frame);
  }

  // ── Single-thread fast path: no section header, just a subtle label ───────
  if (groups.size === 1) {
    const [tid, threadFrames] = [...groups][0]!;
    const color = threadColor(tid);
    return (
      <>
        {[...threadFrames].reverse().map((frame, i) => (
          <FrameCard key={frame.frameId} frame={frame} isTop={i === 0} highlights={highlights} heapIndex={heapIndex} />
        ))}
        <div className="thread-label-single" style={{ borderLeftColor: color }}>
          {tid}
        </div>
      </>
    );
  }

  // ── Multi-thread layout: collapsible thread sections ─────────────────────
  return (
    <>
      {[...groups.entries()].map(([tid, threadFrames]) => {
        const status: ThreadStatus = threadStates?.get(tid) ?? 'RUNNABLE';
        const isBlocked  = status === 'WAITING_ON_LOCK' || status === 'TERMINATED';
        const isExpanded = tid in overrides ? overrides[tid]! : !isBlocked;
        const color      = threadColor(tid);
        const topFrame   = threadFrames[threadFrames.length - 1]!;

        return (
          <div
            key={tid}
            className={`thread-section${isBlocked ? ' thread-section--blocked' : ''}`}
            style={{ '--thread-color': color } as React.CSSProperties}
          >
            <button
              className="thread-section__header"
              onClick={() => setOverrides(prev => ({ ...prev, [tid]: !isExpanded }))}
              aria-expanded={isExpanded}
            >
              <span className="thread-section__name">
                <span className="thread-section__dot" style={{ background: color }} />
                {tid}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusBadge status={status} />
                <span className={`klass-card__chevron${isExpanded ? ' klass-card__chevron--open' : ''}`}>›</span>
              </div>
            </button>

            {isExpanded && (
              <div className="thread-section__frames">
                {[...threadFrames].reverse().map((frame, i) => (
                  <FrameCard key={frame.frameId} frame={frame} isTop={i === 0} highlights={highlights} heapIndex={heapIndex} />
                ))}
              </div>
            )}

            {!isExpanded && (
              <div className="thread-section__collapsed-summary">
                {topFrame.className}.{topFrame.methodName}()
                {threadFrames.length > 1 && (
                  <span style={{ opacity: 0.5, marginLeft: 4 }}>
                    +{threadFrames.length - 1} more
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
