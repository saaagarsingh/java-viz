import type { KlassInfo, HighlightTarget } from '@jvm-viz/engine';
import { formatValue } from '../utils/formatValue.js';

interface Props {
  klasses:    KlassInfo[];
  highlights: HighlightTarget[];
}

function isHighlighted(highlights: HighlightTarget[], klassName: string, field?: string): boolean {
  return highlights.some(
    h => h.region === 'metaspace' && h.elementId === klassName && (field === undefined || h.fieldName === field)
  );
}

export function MetaspacePanel({ klasses, highlights }: Props) {
  if (klasses.length === 0) {
    return <p className="empty-state">No classes loaded</p>;
  }

  return (
    <>
      {klasses.map(klass => {
        const highlighted = isHighlighted(highlights, klass.klassName);
        return (
          <div
            key={klass.klassName}
            id={`klass-${klass.klassName}`}
            className={`klass-card${highlighted ? ' is-highlighted' : ''}`}
          >
            <div className="klass-card__header">
              <span className="klass-card__name">{klass.klassName}</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {klass.isInterface && (
                  <span className="klass-card__badge klass-card__badge--interface">interface</span>
                )}
                {!klass.isInitialized && (
                  <span className="klass-card__badge klass-card__badge--uninit">uninit</span>
                )}
              </div>
            </div>
            <div className="klass-card__body">
              {/* Superclass / interfaces */}
              {(klass.superKlassName !== null || klass.interfaces.length > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {klass.superKlassName && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      extends <span style={{ color: 'var(--region-metaspace)' }}>{klass.superKlassName}</span>
                    </span>
                  )}
                  {klass.interfaces.map(iface => (
                    <span key={iface} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      implements <span style={{ color: 'var(--region-metaspace)' }}>{iface}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Static fields */}
              {klass.staticFields.length > 0 && (
                <div>
                  <div className="klass-card__section-label">static fields</div>
                  {klass.staticFields.map(f => {
                    const fmted = formatValue(f.value);
                    const fieldHighlighted = isHighlighted(highlights, klass.klassName, f.name);
                    return (
                      <div
                        key={f.name}
                        id={`static-${klass.klassName}-${f.name}`}
                        className={`field-row${fieldHighlighted ? ' is-highlighted-field' : ''}`}
                      >
                        <span className="field-row__name">{f.name}</span>
                        <span className={`field-row__value ${fmted.cls}`}>{fmted.text}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* vtable */}
              {klass.vtable.length > 0 && !klass.isInterface && (
                <div>
                  <div className="klass-card__section-label">vtable</div>
                  <div className="vtable">
                    {klass.vtable.map(slot => {
                      const isOverride = slot.implementedBy !== klass.superKlassName && slot.implementedBy !== 'Object';
                      return (
                        <div key={slot.slot} className="vtable__row">
                          <span className="vtable__slot">[{slot.slot}]</span>
                          <span className="vtable__method">{slot.methodName}</span>
                          <span className={`vtable__impl${isOverride && slot.implementedBy === klass.klassName ? ' vtable__impl--override' : ''}`}>
                            {slot.implementedBy}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* itable */}
              {klass.itable.length > 0 && (
                <div>
                  <div className="klass-card__section-label">itable</div>
                  {klass.itable.map(entry => (
                    <div key={entry.interfaceName} style={{ marginBottom: 4 }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--region-metaspace)', marginBottom: 2 }}>
                        {entry.interfaceName}
                      </div>
                      <div className="vtable">
                        {entry.slots.map(slot => (
                          <div key={slot.slot} className="vtable__row">
                            <span className="vtable__slot">[{slot.slot}]</span>
                            <span className="vtable__method">{slot.methodName}</span>
                            <span className="vtable__impl vtable__impl--override">{slot.implementedBy}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
