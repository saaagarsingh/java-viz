import type { HeapObject, HighlightTarget } from '@jvm-viz/engine';
import { formatValue } from '../utils/formatValue.js';

interface Props {
  objects:    HeapObject[];
  highlights: HighlightTarget[];
}

function isHighlighted(highlights: HighlightTarget[], objectId: string, field?: string): boolean {
  return highlights.some(
    h => h.region === 'heap' && h.elementId === objectId && (field === undefined || h.fieldName === field)
  );
}

export function HeapPanel({ objects, highlights }: Props) {
  if (objects.length === 0) {
    return <p className="empty-state">Empty heap</p>;
  }

  return (
    <>
      {objects.map(obj => {
        const highlighted = isHighlighted(highlights, obj.objectId);
        return (
          <div
            key={obj.objectId}
            id={`heap-${obj.objectId}`}
            className={`heap-card${highlighted ? ' is-highlighted' : ''}`}
          >
            <div className="heap-card__header">
              <span className="heap-card__klass">{obj.klassName}</span>
              <span className="heap-card__id">{obj.objectId}</span>
            </div>
            {obj.fields.length > 0 && (
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
