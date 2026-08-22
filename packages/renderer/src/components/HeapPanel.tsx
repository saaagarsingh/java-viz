import { useState } from 'react';
import type { HeapObject, HighlightTarget, Arrow } from '@jvm-viz/engine';
import { formatValue } from '../utils/formatValue.js';

interface Props {
  objects:    HeapObject[];
  highlights: HighlightTarget[];
  arrows:     Arrow[];
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

export function HeapPanel({ objects, highlights, arrows }: Props) {
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});

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
              <span className="heap-card__klass">{obj.klassName}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="heap-card__id">{obj.objectId}</span>
                <span className={`klass-card__chevron${expanded ? ' klass-card__chevron--open' : ''}`}>
                  ›
                </span>
              </div>
            </button>

            {expanded && obj.fields.length > 0 && (
              <div className="heap-card__body">
                {obj.fields.map(field => {
                  const fmted = formatValue(field.value);
                  const fieldHighlighted = isHighlighted(highlights, obj.objectId, field.name);
                  return (
                    <div
                      key={`${field.declaredIn}.${field.name}`}
                      id={`field-${obj.objectId}-${field.name}`}
                      className={`field-row${fieldHighlighted ? ' is-highlighted-field' : ''}`}
                    >
                      <span className="field-row__name">
                        {field.name}
                        {field.declaredIn !== obj.klassName && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: 4 }}>
                            ({field.declaredIn})
                          </span>
                        )}
                      </span>
                      <span className={`field-row__value ${fmted.cls}`}>{fmted.text}</span>
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
