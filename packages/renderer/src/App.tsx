import { useRef, useCallback, useEffect, useState } from 'react';
import { traces }          from '@jvm-viz/engine';
import type { Arrow } from '@jvm-viz/engine';
import { useTraceStore } from './store/trace.store.js';
import { useInterpreter }  from './hooks/useInterpreter.js';
import { StackPanel }      from './components/StackPanel.js';
import { HeapPanel }       from './components/HeapPanel.js';
import { MetaspacePanel }  from './components/MetaspacePanel.js';
import { ArrowOverlay }    from './components/ArrowOverlay.js';
import { MethodInvocationArrow } from './components/MethodInvocationArrow.js';
import { CodePanel }       from './components/CodePanel.js';
import { ResizeHandle }    from './components/ResizeHandle.js';
import { ErrorToast }      from './components/ErrorToast.js';
import { CustomEditor }    from './components/CustomEditor.js';
import { SupportMatrix }   from './components/SupportMatrix.js';
import { ErrorCard }       from './components/ErrorCard.js';

// ── Layout persistence ────────────────────────────────────────────────────────

const LAYOUT_KEY = 'jvm-viz-layout';
const COL_MIN    = 160;

interface LayoutState {
  stackW: number;
  metaspaceW: number;
  codeH: number;
  logW: number;
  logsOpen: boolean;
}

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LayoutState> & {
        col1?: number;
        col2?: number;
        infoW?: number;
      };
      const vw = window.innerWidth;
      return {
        stackW: parsed.stackW ?? parsed.col1 ?? Math.floor(vw * 0.34),
        metaspaceW: parsed.metaspaceW ?? parsed.col2 ?? Math.floor(vw * 0.30),
        codeH: parsed.codeH ?? 280,
        logW: parsed.logW ?? parsed.infoW ?? Math.floor(vw * 0.30),
        logsOpen: parsed.logsOpen ?? true,
      };
    }
  } catch { /* ignore */ }
  const vw = window.innerWidth;
  return {
    stackW: Math.floor(vw * 0.34),
    metaspaceW: Math.floor(vw * 0.30),
    codeH: 280,
    logW: Math.floor(vw * 0.30),
    logsOpen: true,
  };
}
function saveLayout(l: LayoutState) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch { /* ignore */ }
}

interface HeapRefSelection {
  sourceObjectId: string;
  fieldName: string;
  targetObjectId: string;
}

function isHeapReferenceArrow(a: Arrow): boolean {
  return a.from.region === 'heap' && a.to.region === 'heap' && typeof a.from.fieldName === 'string';
}

function isSelectedHeapReferenceArrow(a: Arrow, sel: HeapRefSelection | null): boolean {
  if (!sel) return false;
  return a.from.region === 'heap'
    && a.to.region === 'heap'
    && a.from.elementId === sel.sourceObjectId
    && a.from.fieldName === sel.fieldName
    && a.to.elementId === sel.targetObjectId;
}

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const mainRef = useRef<HTMLDivElement | null>(null);
  const logBodyRef = useRef<HTMLDivElement | null>(null);

  const {
    mode, exampleIdx, customSource, status, steps, error: execError, stepIndex,
    pendingThreads, selectedThreadId,
    selectExample, setMode, setCustomSource, stepForward, stepBack, clearExecution, setSelectedThreadId,
  } = useTraceStore();

  const { runThreadSession, stepThread, drainThreads } = useInterpreter();

  const step       = steps[stepIndex];
  const totalSteps = steps.length;

  const ownedHeapLocks = step
    ? step.heap.filter((obj) => !!obj.monitor?.owner)
    : [];
  const heapLockSummary = ownedHeapLocks.length > 0
    ? ownedHeapLocks
        .map((obj) => {
          const owner = obj.monitor?.owner ?? 'unknown';
          const waiters = obj.monitor?.waitQueue?.length ?? 0;
          return `${obj.klassName}#${obj.objectId.replace(/^obj-/, '')} by ${owner}${waiters > 0 ? ` (${waiters} waiting)` : ''}`;
        })
        .join(' | ')
    : null;
  const classMonitorEvent = step?.delta?.monitorOperation?.objectId?.startsWith('klass:')
    ? `${step.delta.monitorOperation.objectId} by ${step.delta.monitorOperation.threadId}`
    : null;
  const lockSummaryText = heapLockSummary ?? classMonitorEvent ?? 'no active lock';
  const hasActiveLock = !!heapLockSummary || !!classMonitorEvent;

  const [showSupport, setShowSupport] = useState(false);
  const [showHeapRefArrows, setShowHeapRefArrows] = useState(false);
  const [revealedHeapRef, setRevealedHeapRef] = useState<HeapRefSelection | null>(null);

  // Layout (localStorage-persisted, independent of trace state)
  const [layout, setLayout] = useState<LayoutState>(loadLayout);
  const updateLayout = useCallback((patch: Partial<LayoutState>) => {
    setLayout(prev => { const next = { ...prev, ...patch }; saveLayout(next); return next; });
  }, []);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const { stackW, metaspaceW, codeH, logW, logsOpen } = layout;

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

  const currentTrace  = traces[exampleIdx];
  const displaySource = mode === 'example' ? (currentTrace?.sourceCode ?? '') : customSource;
  const hasError      = status === 'error' && !!execError;

  const highlights   = step?.delta?.highlightedElements ?? [];
  const fadingArrows = step?.delta?.fadingArrows ?? [];
  const allArrows = step?.arrows ?? [];
  const visibleArrows = allArrows.filter(a => {
    if (!isHeapReferenceArrow(a)) return true;
    if (showHeapRefArrows) return true;
    return isSelectedHeapReferenceArrow(a, revealedHeapRef);
  });
  const stepLogLines = steps
    .slice(0, stepIndex + 1)
    .map((s, i) => `${i + 1}. ${s.delta?.description ?? s.label}`);

  // Keep the newest appended log line visible while stepping.
  useEffect(() => {
    if (!logsOpen) return;
    const el = logBodyRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [logsOpen, stepIndex, stepLogLines.length]);

  useEffect(() => {
    setRevealedHeapRef(null);
  }, [stepIndex]);

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
            <option value={-1}>Select example...</option>
            {traces.map((t, i) => <option key={t.id} value={i}>{i + 1}. {t.title}</option>)}
          </select>
        )}

        {mode === 'custom' && status === 'done' && pendingThreads.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label="Thread stepping controls">
            <select
              className="toolbar__example-select"
              value={selectedThreadId ?? pendingThreads[0]}
              onChange={(e) => setSelectedThreadId(e.target.value)}
              aria-label="Select worker thread"
              style={{ minWidth: 140 }}
            >
              {pendingThreads.map((tid) => (
                <option key={tid} value={tid}>{tid}</option>
              ))}
            </select>
            <button
              className="stepper__btn"
              onClick={() => selectedThreadId && stepThread(selectedThreadId)}
              disabled={!selectedThreadId}
              aria-label="Step selected thread"
              title="Step selected thread"
            >
              Step Thread
            </button>
            <button
              className="stepper__btn"
              onClick={drainThreads}
              aria-label="Run all pending threads"
              title="Run all pending threads"
            >
              Run All
            </button>
          </div>
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

        <button
          className="toolbar__logs-btn"
          onClick={() => updateLayout({ logsOpen: !logsOpen })}
          aria-label={logsOpen ? 'Close logs panel' : 'Open logs panel'}
          aria-expanded={logsOpen}
          title={logsOpen ? 'Close logs panel' : 'Open logs panel'}
        >
          {logsOpen ? 'Hide logs' : 'Show logs'}
        </button>

        <button
          className="toolbar__logs-btn"
          onClick={() => setShowHeapRefArrows(v => !v)}
          aria-label={showHeapRefArrows ? 'Hide heap reference arrows' : 'Show heap reference arrows'}
          aria-pressed={showHeapRefArrows}
          title={showHeapRefArrows ? 'Hide heap reference arrows' : 'Show heap reference arrows'}
        >
          {showHeapRefArrows ? 'Heap refs on' : 'Heap refs off'}
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
      <main className="main-content main-content--split" ref={mainRef} aria-label="Memory state">
        <section className="workspace-column" aria-label="Stack heap workspace">
          {/* ── Memory row ──────────────────────────────────────────────── */}
          <div className="memory-row memory-row--workspace" style={{ minHeight: 0 }}>
            <section className="region-panel region-panel--stack" aria-label="Stack"
              style={{ width: stackW, minWidth: COL_MIN, flexShrink: 0 }}>
              <div className="region-panel__header">
                <div className="region-panel__dot" /><span className="region-panel__name">Stack</span>
              </div>
              <div className="region-panel__body">
                {noStep
                  ? <p className="empty-state">{status === 'running' ? '⏳ running…' : status === 'error' ? '⚠ error — see logs' : 'no trace'}</p>
                  : <StackPanel
                      frames={step.stack}
                      highlights={highlights}
                      heap={step.heap}
                      {...(step.threadStates ? { threadStates: step.threadStates } : {})}
                      {...(step.threadDisplayNames ? { threadDisplayNames: step.threadDisplayNames } : {})}
                    />}
              </div>
            </section>

            <ResizeHandle axis="x" onResize={d => updateLayout({ stackW: clamp(stackW + d, COL_MIN, 720) })} />

            <section className="region-panel region-panel--heap" aria-label="Heap" style={{ flex: 1, minWidth: COL_MIN }}>
              <div className="region-panel__header">
                <div className="region-panel__dot" /><span className="region-panel__name">Heap</span>
                {!noStep && (
                  <span
                    className={`monitor-pill${hasActiveLock ? ' monitor-pill--active' : ''}`}
                    title={lockSummaryText}
                    aria-label={`Monitor status: ${lockSummaryText}`}
                  >
                    lock: {lockSummaryText}
                  </span>
                )}
              </div>
              <div className="region-panel__body">
                {noStep
                  ? <p className="empty-state">&nbsp;</p>
                  : <HeapPanel
                      objects={step.heap}
                      highlights={highlights}
                      arrows={step.arrows}
                      showHeapRefArrows={showHeapRefArrows}
                      onRevealReference={(sourceObjectId, fieldName, targetObjectId) => {
                        setRevealedHeapRef(prev => {
                          if (prev
                            && prev.sourceObjectId === sourceObjectId
                            && prev.fieldName === fieldName
                            && prev.targetObjectId === targetObjectId) {
                            return null;
                          }
                          return { sourceObjectId, fieldName, targetObjectId };
                        });
                      }}
                      {...(step.delta?.monitorOperation ? { monitorObjectId: step.delta.monitorOperation.objectId } : {})}
                    />}
              </div>
            </section>
          </div>

          <ResizeHandle axis="y" onResize={d => updateLayout({ codeH: clamp(codeH - d, 120, 560) })} />

          {/* ── Bottom panel ────────────────────────────────────────── */}
          <div
            className={`code-panel${logsOpen ? '' : ' code-panel--logs-closed'}`}
            aria-label="Source code and logs"
            style={logsOpen ? { height: codeH, gridTemplateColumns: `1fr ${logW}px` } : { height: codeH }}
          >

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
                onClick={() => runThreadSession(customSource)}
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
            {logsOpen && (
              <div className="code-panel__info-header">
                <span className="code-panel__label">{noStep ? 'logs' : `step ${stepIndex + 1}/${totalSteps}`}</span>
                <div className="code-panel__info-controls">
                  <span className="code-panel__step-label">{step?.label ?? (status === 'error' && execError ? 'Error occurred' : 'paste a program and press ▶ Run')}</span>
                  <button
                    className="code-panel__collapse-btn"
                    onClick={() => updateLayout({ logsOpen: false })}
                    aria-label="Close logs panel"
                    title="Close logs panel"
                  >
                    Hide
                  </button>
                </div>
              </div>
            )}

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
                      onRun={() => runThreadSession(customSource)}
                      isRunning={status === 'running'}
                    />
                  )}
                  {logsOpen && (
                    <ResizeHandle axis="x"
                      onResize={d => updateLayout({ logW: clamp(logW - d, 220, 760) })}
                      className="resize-handle--inside-code" />
                  )}
                </div>

                {/* Right body */}
                {logsOpen && (
                  <div
                    ref={logBodyRef}
                    className={`code-panel__info-body${hasError ? ' code-panel__info-body--error' : ''}`}
                  >
                    {hasError && execError && (
                      <ErrorCard
                        error={execError}
                        onOpenSubset={() => setShowSupport(true)}
                      />
                    )}
                    {stepLogLines.length > 0 && (
                      <pre className="code-panel__step-log">{stepLogLines.join('\n')}</pre>
                    )}
                    {(step?.stdout.length ?? 0) > 0 && (
                      <pre className="code-panel__stdout">{'> ' + step!.stdout.join('\n> ')}</pre>
                    )}
                  </div>
                )}
              </div>
        </section>

        <ResizeHandle axis="x" onResize={d => updateLayout({ metaspaceW: clamp(metaspaceW - d, 220, 720) })} />

        <section className="region-panel region-panel--metaspace" aria-label="Metaspace"
          style={{ width: metaspaceW, minWidth: 220, flexShrink: 0 }}>
          <div className="region-panel__header">
            <div className="region-panel__dot" /><span className="region-panel__name">Metaspace</span>
          </div>
          <div className="region-panel__body">
            {noStep
              ? <p className="empty-state">&nbsp;</p>
              : <MetaspacePanel klasses={step.metaspace} highlights={highlights} arrows={step.arrows} heap={step.heap} />}
          </div>
        </section>

        <ArrowOverlay arrows={visibleArrows} fadingArrows={fadingArrows} containerRef={mainRef} />
        {step && <MethodInvocationArrow currentStep={step} containerRef={mainRef} />}
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

