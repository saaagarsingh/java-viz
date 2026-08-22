import { useRef, useCallback, useEffect } from 'react';

type Axis = 'x' | 'y';

interface DragState {
  startClient: number;
  startSize:   number;
}

/**
 * Returns a mousedown handler that initiates a drag-resize on the given axis.
 * `onResize(delta)` is called with the signed pixel delta from the drag start.
 */
export function useDragHandle(
  axis: Axis,
  onResize: (delta: number) => void,
) {
  const drag = useRef<DragState | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = {
      startClient: axis === 'x' ? e.clientX : e.clientY,
      startSize:   0, // caller tracks absolute size; we emit delta
    };
  }, [axis]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const client = axis === 'x' ? e.clientX : e.clientY;
      onResize(client - drag.current.startClient);
      drag.current = { ...drag.current, startClient: client }; // incremental delta
    };
    const onMouseUp = () => { drag.current = null; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',  onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',  onMouseUp);
    };
  }, [axis, onResize]);

  return onMouseDown;
}
