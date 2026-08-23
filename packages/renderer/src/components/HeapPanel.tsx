import { useState } from 'react';
import type { HeapObject, HighlightTarget, Arrow, MarkWordState } from '@jvm-viz/engine';
import { formatValue } from '../utils/formatValue.js';

interface Props {
  objects:         HeapObject[];
  highlights:      HighlightTarget[];
  arrows:          Arrow[];
  monitorObjectId?: string; // objectId that was just locked/unlocked this step
  showHeapRefArrows?: boolean;
  onRevealReference?: (sourceObjectId: string, fieldName: string, targetObjectId: string) => void;
}

/** Render lock badge for a heap object's markWord state */
function LockBadge({ markWord, justChanged }: { markWord: MarkWordState | undefined; justChanged: boolean }) {
  if (!markWord || markWord === 'unlocked') {
    // No badge when unlocked — absence of badge == unlocked is intuitive
    return null;
  }
  const threadId = typeof markWord === 'object' ? markWord.threadId : '';
  const isFat    = typeof markWord === 'object' && markWord.kind === 'fat-locked';
  return (
    <span
      className={`lock-badge${isFat ? ' lock-badge--fat' : ' lock-badge--thin'}${justChanged ? ' lock-badge--pulse' : ''}`}
      title={`${isFat ? 'fat' : 'thin'}-locked by ${threadId}`}
      aria-label={`Locked by ${threadId}`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <rect x="2" y="5" width="8" height="6" rx="1" fill="currentColor" />
        <path d="M3.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="lock-badge__thread">{threadId}</span>
    </span>
  );
}

function isHighlighted(highlights: HighlightTarget[], objectId: string, field?: string): boolean {
  return highlights.some(
    h => h.region === 'heap' && h.elementId === objectId && (field === undefined || h.fieldName === field)
  );
}

function activeHeapIds(arrows: Arrow[], highlights: HighlightTarget[]): Set<string> {
  const ids = new Set<string>();
  for (const a of arrows) {
    if (a.from.region === 'heap') ids.add(a.from.elementId);
    if (a.to.region   === 'heap') ids.add(a.to.elementId);
  }
  for (const h of highlights) {
    if (h.region === 'heap') ids.add(h.elementId);
  }
  return ids;
}

export function HeapPanel({ objects, highlights, arrows, monitorObjectId, showHeapRefArrows = false, onRevealReference }: Props) {
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});
  const objectLabels = new Map<string, string>(
    objects.map(o => [o.objectId, `${o.klassName}#${o.objectId.replace(/^obj-/, '')}`])
  );

  if (objects.length === 0) {
    return <p className="empty-state">Empty heap</p>;
  }

  const active = activeHeapIds(arrows, highlights);

  function isOpen(objectId: string): boolean {
    return objectId in openOverrides
      ? (openOverrides[objectId] ?? false)
      : active.has(objectId);
  }

  function toggle(objectId: string) {
    setOpenOverrides(prev => ({ ...prev, [objectId]: !isOpen(objectId) }));
  }

  return (
    <>
      {!showHeapRefArrows && (
        <div className="heap-ref-hint" role="note">
          Click a reference value to reveal just that heap edge.
        </div>
      )}
      {objects.map(obj => {
        const highlighted = isHighlighted(highlights, obj.objectId);
        const expanded    = isOpen(obj.objectId);
        return (
          <div
            key={obj.objectId}
            id={`heap-${obj.objectId}`}
            className={`heap-card${highlighted ? ' is-highlighted' : ''}`}
          >
            <button
              className="heap-card__header heap-card__header--btn"
              onClick={() => toggle(obj.objectId)}
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${obj.objectId}`}
            >
              <span className="heap-card__klass">
                {obj.klassName}
                <span className="heap-card__id">#{obj.objectId.replace(/^obj-/, '')}</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LockBadge
                  markWord={obj.markWord}
                  justChanged={obj.objectId === monitorObjectId}
                />
                <span className={`klass-card__chevron${expanded ? ' klass-card__chevron--open' : ''}`}>
                  ›
                </span>
              </div>
            </button>

            {expanded && obj.fields.length > 0 && (
              <div className="heap-card__body">
                {obj.fields.map(field => {
                  const fmted = formatValue(field.value, { objectLabels, refDisplay: 'compact' });
                  const fieldHighlighted = isHighlighted(highlights, obj.objectId, field.name);
                  const refTargetId = field.value.kind === 'ref' ? field.value.objectId : null;
                  return (
                    <div
                      key={`${field.declaredIn}.${field.name}`}
                      id={`field-${obj.objectId}-${field.name}`}
                      className={`field-row${fieldHighlighted ? ' is-highlighted-field' : ''}`}
                    >
                      <span className="field-row__name">
                        {field.isVolatile && (
                          <span className="volatile-badge" title="volatile — always read from/written to main memory">
                            volatile
                          </span>
                        )}
                        {field.name}
                        {field.declaredIn !== obj.klassName && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: 4 }}>
                            ({field.declaredIn})
                          </span>
                        )}
                      </span>
                      {refTargetId ? (
                        <button
                          type="button"
                          className={`field-row__value field-row__value--ref field-row__value--refbtn`}
                          onClick={() => onRevealReference?.(obj.objectId, field.name, refTargetId)}
                          title={`Click to reveal reference edge for ${field.name}`}
                        >
                          {fmted.text}
                        </button>
                      ) : (
                        <span className={`field-row__value ${fmted.cls}`}>{fmted.text}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
