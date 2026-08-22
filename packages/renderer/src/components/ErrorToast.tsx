import { useEffect } from 'react';
import { useTraceStore } from '../store/trace.store.js';

/** Auto-dismisses after 6 seconds. Lives at fixed bottom-right. */
export function ErrorToast() {
  const { toast, dismissToast } = useTraceStore();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 6000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  if (!toast) return null;

  const message = 'Error occurred';

  return (
    <div className="error-toast" role="alert" aria-live="assertive">
      <span className="error-toast__icon">⚠</span>
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
