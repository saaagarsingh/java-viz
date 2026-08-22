import type { StackFrame, HighlightTarget } from '@jvm-viz/engine';
import { formatValue } from '../utils/formatValue.js';

interface Props {
  frames:     StackFrame[];
  highlights: HighlightTarget[];
}

function isHighlighted(highlights: HighlightTarget[], frameId: string, field?: string): boolean {
  return highlights.some(
    h => h.region === 'stack' && h.elementId === frameId && (field === undefined || h.fieldName === field)
  );
}

export function StackPanel({ frames, highlights }: Props) {
  if (frames.length === 0) {
    return <p className="empty-state">Empty stack</p>;
  }

  // Render top of stack last (top frame has most visual weight)
  const ordered = [...frames].reverse();

  return (
    <>
      {ordered.map((frame, i) => {
        const isTop = i === 0;
        const highlighted = isHighlighted(highlights, frame.frameId);
        return (
          <div
            key={frame.frameId}
            id={`frame-${frame.frameId}`}
            className={`frame-card${isTop ? ' frame-card--top' : ''}${highlighted ? ' is-highlighted' : ''}`}
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
                  const fmted = formatValue(local.value);
                  const fieldHighlighted = isHighlighted(highlights, frame.frameId, local.name);
                  return (
                    <div
                      key={local.slot}
                      id={`local-${frame.frameId}-${local.name}`}
                      className={`field-row${fieldHighlighted ? ' is-highlighted-field' : ''}`}
                    >
                      <span className="field-row__name">{local.name}</span>
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
