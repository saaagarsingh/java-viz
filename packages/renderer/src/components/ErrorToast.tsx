import { useEffect } from 'react';
import { useTraceStore } from '../store/trace.store.js';

/** Auto-dismisses after 6 seconds. Lives at fixed top-right. */
export function ErrorToast() {
  const { toast, dismissToast } = useTraceStore();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 6000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  if (!toast) return null;
  const isError = toast.kind === 'error';
  const message = toast.message;

  return (
    <div className={`error-toast ${isError ? 'error-toast--error' : 'error-toast--success'}`} role="alert" aria-live="assertive">
      <span className="error-toast__icon">{isError ? '⚠' : '✓'}</span>
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
