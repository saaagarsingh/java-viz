/**
 * Custom Java code editor with run button.
 * Debounces input so the store updates without spamming renders.
 */
import { useRef, useEffect, useCallback } from 'react';

interface Props {
  value:       string;
  onChange:    (src: string) => void;
  onRun:       () => void;
  isRunning:   boolean;
  disabled?:   boolean;
}

export function CustomEditor({ value, onChange, onRun, isRunning, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ctrl/Cmd+Enter to run
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun();
    }
  }, [onRun]);

  return (
    <div className="custom-editor">
      <div className="custom-editor__header">
        <span className="code-panel__label">custom program</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          ⌘↵ to run
        </span>
        <button
          className={`run-btn${isRunning ? ' run-btn--running' : ''}`}
          onClick={onRun}
          disabled={disabled || isRunning || !value.trim()}
          aria-label="Run program"
        >
          {isRunning ? '⏳ running…' : '▶ Run'}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="custom-editor__textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        placeholder={`// Paste or type your Java program here\n// Supports: classes, inheritance, interfaces, static/instance methods/fields\n// ⌘↵ to run\n\nclass Point {\n    int x;\n    int y;\n    Point(int x, int y) { this.x = x; this.y = y; }\n    public static void main(String[] args) {\n        Point p = new Point(3, 7);\n        System.out.println(p.x);\n    }\n}`}
        aria-label="Java source code"
      />
    </div>
  );
}
