import { useEffect, useRef } from 'react';

interface Props {
  sourceCode:       string;
  activeLineNumber: number | null;  // 1-indexed, matches Step.sourceLineNumber
}

// Single-pass tokenizer — processes the HTML-escaped string once left-to-right.
// Multi-pass replacement would corrupt its own <span> attributes on subsequent passes.
const TOKEN_RE =
  /(@\w+)|("(?:[^"\\]|\\.)*")|((?:\/\/).*)|(\b(?:class|interface|extends|implements|new|return|static|void|int|long|double|float|boolean|char|String|null|this|super|if|else|for|while|public|private|protected|final|abstract)\b)|(\b\d+\b)/g;

function highlightLine(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(TOKEN_RE, (_, ann, str, cmt, kw, num) => {
    if (cmt) return `<span class="tok-comment">${cmt}</span>`;
    if (str) return `<span class="tok-string">${str}</span>`;
    if (ann) return `<span class="tok-annotation">${ann}</span>`;
    if (kw)  return `<span class="tok-keyword">${kw}</span>`;
    if (num) return `<span class="tok-number">${num}</span>`;
    return _;
  });
}

export function CodePanel({ sourceCode, activeLineNumber }: Props) {
  const activeRef = useRef<HTMLDivElement | null>(null);

  // Scroll active line into view whenever it changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeLineNumber]);

  const lines = sourceCode.split('\n');

  return (
    <div className="code-panel-viewer" role="region" aria-label="Source code">
      <div className="code-panel-viewer__inner">
        {lines.map((line, i) => {
          const lineNum   = i + 1;
          const isActive  = lineNum === activeLineNumber;
          return (
            <div
              key={lineNum}
              ref={isActive ? activeRef : null}
              className={`code-line${isActive ? ' code-line--active' : ''}`}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className="code-line__gutter">
                {isActive ? '►' : lineNum}
              </span>
              <span
                className="code-line__text"
                // Safe: we control the source strings, not user input
                dangerouslySetInnerHTML={{ __html: highlightLine(line) || '&nbsp;' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
