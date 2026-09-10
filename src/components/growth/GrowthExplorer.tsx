import { createPortal } from 'react-dom';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import {
  compactGrowthGraph,
  growthAncestry,
  loadGrowthGraph,
  type GrowthGraph,
} from '@/services/growth-graph';
import { TASKS_CHANGED } from '@/services/working-copies';
import GrowthInspector from './GrowthInspector';
import { laneColor } from './graph-style';

const Canvas2D = lazy(() => import('./GrowthGraphCanvas'));
const Canvas3D = lazy(() => import('./GrowthGraph3D'));
const action =
  'rounded px-3 py-1.5 text-xs border border-border hover:border-accent cursor-pointer disabled:opacity-50';

export default function GrowthExplorer({
  cruxId,
  onClose,
}: {
  cruxId: string;
  onClose: () => void;
}) {
  const [graph, setGraph] = useState<GrowthGraph | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [fit, setFit] = useState(0);
  const [query, setQuery] = useState('');
  const [laneFilter, setLaneFilter] = useState('');
  const [listLimit, setListLimit] = useState(60);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [refresh, setRefresh] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const select = useCallback((id: string) => setSelectedId(id || null), []);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    let live = true;
    let loading = false;
    const load = async () => {
      if (!live || loading || document.hidden) return;
      loading = true;
      try {
        const next = await loadGrowthGraph(cruxId);
        if (live) {
          setGraph((previous) =>
            JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
          );
          setError('');
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    let debounce: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void load(), 300);
    };
    window.addEventListener(TASKS_CHANGED, changed);
    document.addEventListener('visibilitychange', changed);
    return () => {
      live = false;
      clearInterval(timer);
      clearTimeout(debounce);
      window.removeEventListener(TASKS_CHANGED, changed);
      document.removeEventListener('visibilitychange', changed);
    };
  }, [cruxId, refresh]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const display = useMemo(
    () =>
      graph
        ? compactGrowthGraph(
            graph,
            new Set(expanded ? graph.lanes.map((l) => l.id) : []),
            selectedId,
          )
        : null,
    [graph, expanded, selectedId],
  );
  const ancestry = useMemo(
    () => (graph && selectedId ? growthAncestry(graph, selectedId) : new Set<string>()),
    [graph, selectedId],
  );
  const selected = graph?.nodes.find((n) => n.id === selectedId);
  const listed = useMemo(() => {
    if (!graph) return [];
    const titles = new Map(graph.lanes.map((l) => [l.id, l.title]));
    return graph.nodes
      .filter(
        (n) =>
          (!laneFilter || n.ownerId === laneFilter) &&
          `${n.title} ${titles.get(n.ownerId)}`.toLowerCase().includes(query.toLowerCase()),
      )
      .slice()
      .reverse();
  }, [graph, query, laneFilter]);
  const canvasProps = display && {
    graph: display,
    ...size,
    selectedId,
    ancestry,
    onSelect: select,
    fit,
    reducedMotion,
  };

  return createPortal(
    <Modal open onClose={onClose} size="full" flush>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Whole Crux Growth"
        tabIndex={-1}
        className="flex flex-col h-full min-h-0 outline-none"
        data-testid="growth-explorer"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const focusable = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input, select, [tabindex="0"]',
            ),
          ].filter((el) => el.offsetParent !== null);
          const first = focusable[0],
            last = focusable.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === dialogRef.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
          <div>
            <p className="text-xs uppercase tracking-widest font-mono text-accent">
              Growth · Whole Crux
            </p>
            <h2 className="font-display text-xl">{graph?.title ?? 'Your creation’s history'}</h2>
            <p className="text-xs text-text-muted mt-1">
              {graph
                ? `${graph.nodes.filter((n) => n.kind !== 'copy').length} checkpoints · ${graph.lanes.length - 1} Tasks · branches and merges preserved`
                : 'Loading saved history…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`${action} ${mode === '2d' ? 'bg-accent-muted text-accent border-accent' : ''}`}
              aria-pressed={mode === '2d'}
              onClick={() => setMode('2d')}
            >
              2D lanes
            </button>
            <button
              className={`${action} ${mode === '3d' ? 'bg-accent-muted text-accent border-accent' : ''}`}
              aria-pressed={mode === '3d'}
              onClick={() => setMode('3d')}
            >
              Explore in 3D
            </button>
            <button className={action} onClick={() => setFit((n) => n + 1)}>
              Fit graph
            </button>
            <button className={action} onClick={() => setRefresh((n) => n + 1)}>
              Refresh
            </button>
            <button className={action} onClick={onClose} aria-label="Close Growth graph">
              Close
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="px-4 py-2 text-error text-sm">
            {error}
            {graph ? ' Showing the last loaded history.' : ''}
          </p>
        )}
        {!!graph?.warnings.length && (
          <p role="status" className="px-4 py-2 text-warning text-xs">
            {graph.warnings.join(' ')}
          </p>
        )}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          <div className="flex flex-col flex-1 min-w-0 min-h-[220px]">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-border text-xs">
              {graph?.lanes.map((lane, index) => (
                <button
                  key={lane.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface"
                  onClick={() => select(`copy:${lane.id}`)}
                >
                  <span
                    aria-hidden="true"
                    className="w-2 h-2 rounded-full"
                    style={{ background: laneColor(index) }}
                  />
                  {lane.title}
                  {lane.phase !== 'main'
                    ? ` · ${lane.phase === 'ready' ? 'open' : lane.phase}`
                    : ''}
                </button>
              ))}
            </div>
            <div
              ref={canvasRef}
              className="flex-1 min-h-0 relative overflow-hidden bg-[#101c19]"
              data-testid={`growth-canvas-${mode}`}
            >
              {canvasProps &&
                size.width > 0 &&
                size.height > 0 &&
                (canvasProps.graph.nodes.length > 1500 ? (
                  <p className="p-6 text-[#e1eee5]">
                    This view has over 1,500 visible checkpoints. Compact the graph or use the
                    checkpoint browser to explore its saved history.
                  </p>
                ) : (
                  <ErrorBoundary
                    key={mode}
                    fallback={
                      <div className="p-6 text-[#e1eee5] space-y-3">
                        <p>
                          The graph renderer is unavailable. All saved history is still accessible
                          in the checkpoint browser.
                        </p>
                        <button className={action} onClick={() => setMode('2d')}>
                          Use 2D lanes
                        </button>
                      </div>
                    }
                  >
                    <Suspense
                      fallback={
                        <p role="status" className="p-6 text-[#e1eee5]">
                          Opening {mode === '3d' ? '3D' : '2D'} Growth…
                        </p>
                      }
                    >
                      {mode === '3d' ? (
                        <Canvas3D {...canvasProps} />
                      ) : (
                        <Canvas2D {...canvasProps} />
                      )}
                    </Suspense>
                  </ErrorBoundary>
                ))}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 p-3 border-t border-border text-xs text-text-muted">
              <span>
                {mode === '3d'
                  ? 'Drag to orbit · scroll to zoom · select to follow ancestry'
                  : 'Time flows down · scroll to zoom · select to follow ancestry'}
              </span>
              <button
                className={action}
                aria-pressed={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? 'Compact checkpoints' : 'Expand checkpoints'}
              </button>
            </footer>
          </div>
          <aside
            className="w-full md:w-80 md:shrink-0 max-h-[45%] md:max-h-none border-t md:border-t-0 md:border-l border-border overflow-y-auto"
            aria-label="Checkpoint browser"
          >
            <div className="p-3 space-y-2 border-b border-border">
              <h3 className="text-sm font-medium">Explore checkpoints</h3>
              <input
                aria-label="Find checkpoint"
                placeholder="Find a checkpoint…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setListLimit(60);
                }}
                className="w-full text-xs bg-surface border border-border rounded p-2"
              />
              <select
                aria-label="Filter history by Task"
                value={laneFilter}
                onChange={(e) => {
                  setLaneFilter(e.target.value);
                  setListLimit(60);
                }}
                className="w-full text-xs bg-surface border border-border rounded p-2"
              >
                <option value="">Main and all Tasks</option>
                {graph?.lanes.map((lane) => (
                  <option key={lane.id} value={lane.id}>
                    {lane.title}
                  </option>
                ))}
              </select>
              <div className="max-h-44 overflow-y-auto space-y-1" aria-label="Saved checkpoints">
                {listed.slice(0, listLimit).map((node) => (
                  <button
                    key={node.id}
                    aria-pressed={selectedId === node.id}
                    onClick={() => select(node.id)}
                    className={`block w-full rounded p-2 text-left text-xs border ${selectedId === node.id ? 'border-accent bg-accent-muted' : 'border-transparent hover:bg-surface'}`}
                  >
                    <span className="block truncate">{node.title}</span>
                    <span className="text-text-muted">
                      {graph?.lanes.find((l) => l.id === node.ownerId)?.title} ·{' '}
                      {node.kind === 'copy'
                        ? 'Working Copy'
                        : node.kind === 'merge'
                          ? 'Merge checkpoint'
                          : 'Checkpoint'}
                    </span>
                  </button>
                ))}
                {!listed.length && graph && (
                  <p className="text-xs text-text-muted">No matching checkpoints.</p>
                )}
                {listed.length > listLimit && (
                  <button className={action} onClick={() => setListLimit((n) => n + 60)}>
                    Show more checkpoints
                  </button>
                )}
              </div>
            </div>
            {graph && selected ? (
              <GrowthInspector
                key={selected.id}
                graph={graph}
                node={selected}
                onSelect={select}
                onClose={onClose}
              />
            ) : (
              <div className="p-4 text-sm text-text-muted space-y-3">
                <p>
                  Select a checkpoint to explore its Artifacts and the Collaboration that produced
                  it.
                </p>
                <p>
                  Circles are checkpoints, diamonds in 2D mark merges, and outlined endpoints mark
                  Working Copies. Gold connections bring a Task into Main.
                </p>
                <p>
                  Completed Tasks remain part of the story. Browsing here does not change your work.
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </Modal>,
    document.body,
  );
}
