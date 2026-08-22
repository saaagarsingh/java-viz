import { useCallback } from 'react';
import { useDragHandle } from '../hooks/useDragHandle.js';

interface Props {
  axis:      'x' | 'y';
  onResize:  (delta: number) => void;
  className?: string;
}

export function ResizeHandle({ axis, onResize, className = '' }: Props) {
  const onMouseDown = useDragHandle(axis, onResize);

  return (
    <div
      className={`resize-handle resize-handle--${axis} ${className}`}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={`Drag to resize ${axis === 'x' ? 'columns' : 'rows'}`}
      tabIndex={0}
    />
  );
}
