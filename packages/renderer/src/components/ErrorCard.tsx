import type { ExecutionError } from '../store/trace.store.js';
import { errorSummary } from '../store/trace.store.js';

interface Props {
  error:          ExecutionError;
  onOpenSubset?:  () => void;   // opens the ✓ supported panel
}

/**
 * Renders a contextual error card.
 * unsupported_syntax → friendly "not in scope" contract card.
 * parse_error        → syntax problem + line hint.
 * everything else    → runtime exception badge.
 */
export function ErrorCard({ error, onOpenSubset }: Props) {

  // ── Unsupported feature ───────────────────────────────────────
  if (error.kind === 'unsupported_syntax') {
    // Feature string may contain "(Phase X)" — split it out
    const raw      = error.feature ?? '';
    const phaseMatch = raw.match(/\(([^)]+)\)$/);
    const phasePart  = phaseMatch ? phaseMatch[1] : null;
    const featureName = phasePart ? raw.slice(0, raw.lastIndexOf('(')).trim() : raw;
    const line       = error.line;

    return (
      <div className="error-card error-card--unsupported">
        <div className="error-card__icon-row">
          <span className="error-card__icon">⊘</span>
          <span className="error-card__title">Not supported in this visualizer</span>
        </div>

        <code className="error-card__feature">{featureName}</code>

        {line != null && (
          <span className="error-card__line">at line {line}</span>
        )}

        <p className="error-card__hint">
          This construct is outside the current teaching subset.
          {phasePart && <> It is planned for <strong>{phasePart}</strong>.</>}
        </p>

        <div className="error-card__actions">
          <span className="error-card__action-label">
            Simplify your program to use only constructs listed in
          </span>
          {onOpenSubset ? (
            <button className="error-card__subset-btn" onClick={onOpenSubset}>
              <span>✓</span> supported
            </button>
          ) : (
            <span className="error-card__subset-ref">✓ supported</span>
          )}
        </div>
      </div>
    );
  }

  // ── Parse / syntax error ──────────────────────────────────────
  if (error.kind === 'parse_error') {
    return (
      <div className="error-card error-card--parse">
        <div className="error-card__icon-row">
          <span className="error-card__icon">✕</span>
          <span className="error-card__title">Parse error</span>
          {error.line != null && (
            <span className="error-card__line">line {error.line}</span>
          )}
        </div>
        <p className="error-card__message">{error.message}</p>
        <p className="error-card__hint">
          Check for missing semicolons, unmatched braces, or unsupported syntax.
        </p>
      </div>
    );
  }

  // ── Runtime errors ────────────────────────────────────────────
  const runtimeIcons: Partial<Record<ExecutionError['kind'], string>> = {
    null_pointer:    '⚡',
    division_by_zero:'⚡',
    stack_overflow:  '↯',
    out_of_memory:   '↯',
    step_limit:      '∞',
    class_not_found: '?',
    runtime_error:   '⚡',
  };
  const icon = runtimeIcons[error.kind] ?? '⚠';

  return (
    <div className="error-card error-card--runtime">
      <div className="error-card__icon-row">
        <span className="error-card__icon">{icon}</span>
        <span className="error-card__title">Runtime error</span>
      </div>
      <p className="error-card__message">{errorSummary(error)}</p>
    </div>
  );
}
