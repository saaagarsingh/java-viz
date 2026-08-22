import { useRef, useCallback, useEffect, useState } from 'react';
import { traces }          from '@jvm-viz/engine';
import { useTraceStore, errorSummary } from './store/trace.store.js';
import { useInterpreter }  from './hooks/useInterpreter.js';
import { StackPanel }      from './components/StackPanel.js';
import { HeapPanel }       from './components/HeapPanel.js';
import { MetaspacePanel }  from './components/MetaspacePanel.js';
import { ArrowOverlay }    from './components/ArrowOverlay.js';
import { CodePanel }       from './components/CodePanel.js';
import { ResizeHandle }    from './components/ResizeHandle.js';
import { ErrorToast }      from './components/ErrorToast.js';
import { CustomEditor }    from './components/CustomEditor.js';
import { SupportMatrix }   from './components/SupportMatrix.js';
import { ErrorCard }       from './components/ErrorCard.js';

// ── Layout persistence ────────────────────────────────────────────────────────

const LAYOUT_KEY = 'jvm-viz-layout';
const COL_MIN    = 160;

interface LayoutState { col1: number; col2: number; codeH: number; infoW: number; }

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return JSON.parse(raw) as LayoutState;
  } catch { /* ignore */ }
  const vw  = window.innerWidth;
  const col = Math.floor((vw - 8) / 3);
  return { col1: col, col2: col, codeH: 280, infoW: Math.floor(vw * 0.28) };
}
function saveLayout(l: LayoutState) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch { /* ignore */ }
}

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const mainRef = useRef<HTMLDivElement | null>(null);

  const {
    mode, exampleIdx, customSource, status, steps, error: execError, stepIndex,
    selectExample, setMode, setCustomSource, stepForward, stepBack, clearExecution,
  } = useTraceStore();

  const { run } = useInterpreter();

  const step       = steps[stepIndex];
  const totalSteps = steps.length;

  const [showSupport, setShowSupport] = useState(false);

  // Layout (localStorage-persisted, independent of trace state)
  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const updateLayout = useCallback((patch: Partial<LayoutState>) => {
    setLayout(prev => { const next = { ...prev, ...patch }; saveLayout(next); return next; });
  }, []);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const { col1, col2, codeH, infoW } = layout;

  // Keyboard nav — skip when textarea is focused
  const goPrev = useCallback(() => stepBack(),    [stepBack]);
  const goNext = useCallback(() => stepForward(), [stepForward]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  // Bootstrap example on first load
  useEffect(() => {
    if (status === 'idle' && mode === 'example') selectExample(exampleIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTrace  = traces[exampleIdx];
  const displaySource = mode === 'example' ? (currentTrace?.sourceCode ?? '') : customSource;
  const hasError      = status === 'error' && !!execError;

  const highlights   = step?.delta?.highlightedElements ?? [];
  const fadingArrows = step?.delta?.fadingArrows ?? [];

  // Empty-state content shown in memory panels when there's no step yet
  const noStep = !step;

  return (
    <div className="app">
      <ErrorToast />
      <SupportMatrix open={showSupport} onClose={() => setShowSupport(false)} />

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <header className="toolbar" role="banner">
        <span className="toolbar__title">JVM Visualizer</span>

        <div className="mode-tabs" role="tablist" aria-label="Input mode">
          <button className={`mode-tab${mode === 'example' ? ' mode-tab--active' : ''}`}
            role="tab" aria-selected={mode === 'example'} onClick={() => setMode('example')}>
            Examples
          </button>
          <button className={`mode-tab${mode === 'custom' ? ' mode-tab--active' : ''}`}
            role="tab" aria-selected={mode === 'custom'} onClick={() => setMode('custom')}>
            Custom
          </button>
        </div>

        {mode === 'example' && (
          <select className="toolbar__example-select" value={exampleIdx}
            onChange={e => selectExample(Number(e.target.value))} aria-label="Select example program">
            {traces.map((t, i) => <option key={t.id} value={i}>{i + 1}. {t.title}</option>)}
          </select>
        )}

        {mode === 'custom' && status !== 'idle' && (
          <span className={`status-banner status-banner--${status}`}>
            {status === 'running' && '⏳ running…'}
            {status === 'done'    && `✓ ${totalSteps} steps`}
            {status === 'error'   && execError && '⚠ Error occurred'}
          </span>
        )}

        <button
          className={`toolbar__support-btn${showSupport ? ' toolbar__support-btn--active' : ''}`}
          onClick={() => setShowSupport(s => !s)}
          aria-label="Toggle language subset reference"
          aria-expanded={showSupport}
          title="Java subset supported by this visualizer"
        >
          <span className="toolbar__support-check">✓</span> supported
        </button>

        <nav className="stepper" aria-label="Step navigation" style={{ marginLeft: 'auto' }}>
          <button className="stepper__btn" onClick={goPrev} disabled={stepIndex === 0}
            aria-label="Previous step" title="← Previous step">‹</button>
          <span className="stepper__counter" aria-live="polite">{stepIndex + 1} / {totalSteps}</span>
          <button className="stepper__btn" onClick={goNext} disabled={stepIndex === totalSteps - 1}
            aria-label="Next step" title="Next step →">›</button>
        </nav>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="main-content" ref={mainRef} aria-label="Memory state"
        style={{ display: 'flex', flexDirection: 'column' }}>

        {/* ── Memory row ────────────────────────────────────────────────── */}
        <div className="memory-row" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <section className="region-panel region-panel--stack" aria-label="Stack"
            style={{ width: col1, minWidth: COL_MIN, flexShrink: 0 }}>
            <div className="region-panel__header">
              <div className="region-panel__dot" /><span className="region-panel__name">Stack</span>
            </div>
            <div className="region-panel__body">
              {noStep
                ? <p className="empty-state">{status === 'running' ? '⏳ running…' : status === 'error' ? '⚠ error — see step info' : 'no trace'}</p>
                : <StackPanel frames={step.stack} highlights={highlights} />}
            </div>
          </section>

          <ResizeHandle axis="x" onResize={d => updateLayout({ col1: clamp(col1 + d, COL_MIN, 600) })} />

          <section className="region-panel region-panel--heap" aria-label="Heap"
            style={{ width: col2, minWidth: COL_MIN, flexShrink: 0 }}>
            <div className="region-panel__header">
              <div className="region-panel__dot" /><span className="region-panel__name">Heap</span>
            </div>
            <div className="region-panel__body">
              {noStep
                ? <p className="empty-state">&nbsp;</p>
                : <HeapPanel objects={step.heap} highlights={highlights} arrows={step.arrows} />}
            </div>
          </section>

          <ResizeHandle axis="x" onResize={d => updateLayout({ col2: clamp(col2 + d, COL_MIN, 700) })} />

          <section className="region-panel region-panel--metaspace" aria-label="Metaspace"
            style={{ flex: 1, minWidth: COL_MIN }}>
            <div className="region-panel__header">
              <div className="region-panel__dot" /><span className="region-panel__name">Metaspace</span>
            </div>
            <div className="region-panel__body">
              {noStep
                ? <p className="empty-state">&nbsp;</p>
                : <MetaspacePanel klasses={step.metaspace} highlights={highlights} arrows={step.arrows} />}
            </div>
          </section>
        </div>

        <ResizeHandle axis="y" onResize={d => updateLayout({ codeH: clamp(codeH - d, 100, 520) })} />

        {/* ── Bottom panel ──────────────────────────────────────────────── */}
        <div className="code-panel" aria-label="Source code and step info"
          style={{ height: codeH, gridTemplateColumns: `1fr ${infoW}px` }}>

          {/* Left header */}
          {mode === 'example' ? (
            <div className="code-panel__code-header">
              <span className="code-panel__label">source</span>
              {step?.sourceLineNumber != null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--region-heap)' }}>
                  ► line {step.sourceLineNumber}
                </span>
              )}
            </div>
          ) : steps.length > 0 ? (
            /* Custom — viewing mode: show line indicator + edit/re-run controls */
            <div className="code-panel__code-header">
              <button className="code-panel__edit-btn" onClick={clearExecution} title="Return to editor">
                ◀ edit
              </button>
              {step?.sourceLineNumber != null && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--region-heap)', marginLeft: 'auto' }}>
                  ► line {step.sourceLineNumber}
                </span>
              )}
              <button
                className={`run-btn${status === 'running' ? ' run-btn--running' : ''}`}
                onClick={() => run(customSource)}
                disabled={status === 'running' || !customSource.trim()}
                style={{ marginLeft: step?.sourceLineNumber != null ? undefined : 'auto' }}
              >
                {status === 'running' ? '⏳' : '▶ Run'}
              </button>
            </div>
          ) : (
            /* Custom — edit mode: CustomEditor has its own header */
            <div className="code-panel__code-header" style={{ padding: 0, borderBottom: 'none' }} />
          )}

          {/* Right header */}
          <div className="code-panel__info-header">
            <span className="code-panel__label">{noStep ? 'ready' : `step ${stepIndex + 1}/${totalSteps}`}</span>
            <span className="code-panel__step-label">{step?.label ?? (status === 'error' && execError ? 'Error occurred' : 'paste a program and press ▶ Run')}</span>
          </div>

          {/* Left body */}
          <div className="code-panel__code-body" style={{ position: 'relative' }}>
            {mode === 'example' ? (
              <CodePanel sourceCode={displaySource} activeLineNumber={step?.sourceLineNumber ?? null} />
            ) : steps.length > 0 ? (
              /* Custom — viewing: read-only code with active line highlighted */
              <CodePanel sourceCode={customSource} activeLineNumber={step?.sourceLineNumber ?? null} />
            ) : (
              /* Custom — editing: textarea */
              <CustomEditor
                value={customSource}
                onChange={setCustomSource}
                onRun={() => run(customSource)}
                isRunning={status === 'running'}
              />
            )}
            <ResizeHandle axis="x"
              onResize={d => updateLayout({ infoW: clamp(infoW - d, 180, 600) })}
              className="resize-handle--inside-code" />
          </div>

          {/* Right body */}
          <div className={`code-panel__info-body${hasError ? ' code-panel__info-body--error' : ''}`}>
            {hasError && execError && (
              <ErrorCard
                error={execError}
                onOpenSubset={() => setShowSupport(true)}
              />
            )}
            {step?.delta && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {step.delta.description}
              </p>
            )}
            {(step?.stdout.length ?? 0) > 0 && (
              <pre className="code-panel__stdout">{'> ' + step!.stdout.join('\n> ')}</pre>
            )}
          </div>
        </div>

        <ArrowOverlay arrows={step?.arrows ?? []} fadingArrows={fadingArrows} containerRef={mainRef} />
      </main>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <footer className="legend" role="complementary" aria-label="Color legend">
        <div className="legend__group" aria-label="Regions">
          <div className="legend__item"><div className="legend__swatch legend__swatch--stack" /><span className="legend__text">Stack</span></div>
          <div className="legend__item"><div className="legend__swatch legend__swatch--heap" /><span className="legend__text">Heap</span></div>
          <div className="legend__item"><div className="legend__swatch legend__swatch--metaspace" /><span className="legend__text">Metaspace</span></div>
        </div>
        <div className="legend__divider" />
        <div className="legend__group" aria-label="Arrow types">
          <div className="legend__item"><div className="legend__line legend__line--invoke" /><span className="legend__text">virtual/interface call</span></div>
          <div className="legend__item"><div className="legend__line legend__line--static" /><span className="legend__text">static/special call</span></div>
          <div className="legend__item"><div className="legend__line legend__line--read" /><span className="legend__text">read / return</span></div>
          <div className="legend__item"><div className="legend__line legend__line--klass" /><span className="legend__text">klass / vtable lookup</span></div>
        </div>
        <div className="legend__divider" />
        <div className="legend__group">
          <div className="legend__item">
            <div style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(251,191,36,0.35)', border: '1px solid rgba(251,191,36,0.6)' }} />
            <span className="legend__text">just changed</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          ← → to step · ⌘↵ to run
        </div>
      </footer>
    </div>
  );
}

