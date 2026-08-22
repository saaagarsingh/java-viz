import { useEffect } from 'react';
import { useTraceStore, errorSummary } from '../store/trace.store.js';

/** Auto-dismisses after 6 seconds. Lives at fixed bottom-right. */
export function ErrorToast() {
  const { toast, dismissToast } = useTraceStore();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 6000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  if (!toast) return null;

  // Unsupported features get a distinct contract message in the toast
  const isUnsupported = toast.kind === 'unsupported_syntax';
  const message = isUnsupported
    ? `Not supported: ${toast.feature}${toast.line ? ` (line ${toast.line})` : ''}`
    : errorSummary(toast);

  return (
    <div className={`error-toast${isUnsupported ? ' error-toast--unsupported' : ''}`} role="alert" aria-live="assertive">
      <span className="error-toast__icon">{isUnsupported ? '⊘' : '⚠'}</span>
      <span className="error-toast__message">{message}</span>
      <button
        className="error-toast__close"
        onClick={dismissToast}
        aria-label="Dismiss error"
      >
        ✕
      </button>
    </div>
  );
}
