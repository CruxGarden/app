import { createPortal } from 'react-dom';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/ui';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import GrowthInspector from '@/components/growth/GrowthInspector';
import { laneColor } from '@/components/growth/graph-style';
import { compactGrowthGraph, growthAncestry } from '@/services/growth-graph';
import {
  loadCruxspaceHistory,
  type CruxspaceHistory,
  type CruxspaceMilestone,
} from '@/services/cruxspace-history';
import {
  CRUXSPACE_MOMENT_CHANGED,
  getCruxspaceMoment,
  setCruxspaceMoment,
} from '@/services/cruxspace-moment';
import { planCruxspaceRevert, revertCruxspaceTo } from '@/stores/cruxspaceRevert';
import { confirmDialog } from '@/stores/dialogStore';

const Canvas2D = lazy(() => import('@/components/growth/GrowthGraphCanvas'));
const action =
  'rounded px-3 py-1.5 text-xs border border-border hover:border-accent cursor-pointer disabled:opacity-50';

/**
 * The story of a Cruxspace (G10): what it is for, who its members are, every
 * milestone across them in one list and one graph, and a walkthrough that
 * puts every member at a chosen moment.
 */
export default function CruxspaceStory({
  spaceId,
  onClose,
}: {
  spaceId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [history, setHistory] = useState<CruxspaceHistory | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [fit, setFit] = useState(0);
  const [query, setQuery] = useState('');
  const [everything, setEverything] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [moment, setMoment] = useState(getCruxspaceMoment);
  const [notice, setNotice] = useState('');
  const [reverting, setReverting] = useState(false);
  const [reload, setReload] = useState(0);
  const [reducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const select = useCallback((id: string) => setSelectedId(id || null), []);

  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let live = true;
    setRefreshing(true);
    loadCruxspaceHistory(spaceId)
      .then((h) => {
        if (live) setHistory(h);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setRefreshing(false);
      });
    return () => {
      live = false;
    };
  }, [spaceId, reload]);
  useEffect(() => {
    const update = () => setMoment(getCruxspaceMoment());
    window.addEventListener(CRUXSPACE_MOMENT_CHANGED, update);
    return () => window.removeEventListener(CRUXSPACE_MOMENT_CHANGED, update);
  }, []);
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
  }, [history]);
  useEffect(() => {
    dialogRef.current?.focus();
  }, [history]);

  const graph = history?.graph ?? null;
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
  const selected = graph?.nodes.find((n) => n.id === selectedId) ?? null;
  const milestones = useMemo(() => {
    const all = (everything ? history?.checkpoints : history?.milestones) ?? [];
    const q = query.trim().toLowerCase();
    return q
      ? all.filter((m) => `${m.title} ${m.memberTitle} ${m.laneTitle}`.toLowerCase().includes(q))
      : all;
  }, [history, query, everything]);
  const walking = moment && history && moment.spaceId === history.space.id ? moment : null;
  const stepIndex = walking
    ? (history!.milestones.findIndex((m) => m.id === walking.milestoneId) ?? -1)
    : -1;

  const goTo = (milestone: CruxspaceMilestone) => {
    if (!history) return;
    const index = history.milestones.indexOf(milestone);
    // An automatic save counts as the last milestone before it.
    const step =
      index >= 0
        ? index + 1
        : history.milestones.filter((m) => m.created <= milestone.created).length;
    setCruxspaceMoment({
      spaceId: history.space.id,
      spaceName: history.space.name,
      milestoneId: milestone.id,
      title: milestone.title,
      at: milestone.created,
      step,
      steps: history.milestones.length,
    });
    if (milestone.nodeId) setSelectedId(milestone.nodeId);
  };
  const step = (delta: number) => {
    if (!history?.milestones.length) return;
    const next = Math.min(
      history.milestones.length - 1,
      Math.max(
        0,
        (stepIndex < 0 ? (delta > 0 ? -1 : history.milestones.length) : stepIndex) + delta,
      ),
    );
    goTo(history.milestones[next]!);
  };
  const revertAll = async () => {
    if (!walking) return;
    setNotice('');
    setReverting(true);
    try {
      const plan = await planCruxspaceRevert(walking.spaceId, walking.at);
      if (plan.blockers.length) {
        setNotice(`Stop the work in progress first: ${plan.blockers.join(' ')}`);
        return;
      }
      const going = plan.members.filter((m) => m.snapshotId);
      const staying = plan.members.filter((m) => !m.snapshotId);
      const ok = await confirmDialog({
        title: 'Revert every member to this moment',
        message: [
          `Every member of ${walking.spaceName} goes back to its last checkpoint before “${walking.title}”, files on disk included. Each gets a “Before revert” checkpoint first, so Growth can bring the current state back.`,
          ...going.map((m) => `• ${m.title} → ${m.label}`),
          ...(staying.length
            ? [`Left as they are (they did not exist yet): ${staying.map((m) => m.title).join(', ')}.`]
            : []),
        ].join('\n'),
        confirmLabel: 'Revert every member',
      });
      if (!ok) return;
      const report = await revertCruxspaceTo(walking.spaceId, walking.at);
      setNotice(
        `Reverted ${report.reverted.join(', ')}${report.skipped.length ? `; left ${report.skipped.join(', ')} as they were` : ''}. The current state is now this moment; “Before revert” checkpoints hold what came after.`,
      );
      setSelectedId(null);
      setReload((n) => n + 1);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setReverting(false);
    }
  };
  const openMember = (cruxId: string, nodeId: string | null) => {
    onClose();
    navigate(nodeId ? `/c/${cruxId}?growth=${encodeURIComponent(nodeId)}` : `/c/${cruxId}`);
  };
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString() : '');

  return createPortal(
    <Modal open onClose={onClose} size="full" flush>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Cruxspace history"
        tabIndex={-1}
        className="flex flex-col h-full min-h-0 outline-none"
        data-testid="cruxspace-story"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
          <div>
            <p className="text-xs uppercase tracking-widest font-mono text-accent">
              Cruxspace · history
            </p>
            <h2 className="font-display text-xl">{history?.space.name ?? 'Loading…'}</h2>
            <p className="text-xs text-text-muted mt-1">
              {history
                ? `${history.members.length} members · ${history.milestones.length} milestones · ${history.transfers.length} transfers between members`
                : 'Reading every member’s history…'}
              {history && refreshing && (
                <span role="status" aria-label="Refreshing history">
                  {' '}
                  · refreshing…
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={action}
              aria-pressed={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Compact checkpoints' : 'Expand checkpoints'}
            </button>
            <button className={action} onClick={() => setFit((n) => n + 1)}>
              Fit graph
            </button>
            <button className={action} onClick={onClose} aria-label="Close Cruxspace history">
              Close
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="px-4 py-2 text-error text-sm">
            {error}
          </p>
        )}
        {graph?.warnings.map((w) => (
          <p key={w} role="status" className="px-4 py-2 text-warning text-xs">
            {w}
          </p>
        ))}
        {walking && (
          <div
            role="status"
            aria-label="Walkthrough"
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-accent-muted text-sm border-b border-border"
          >
            <span>
              Walking through <strong>{walking.spaceName}</strong> · step {walking.step} of{' '}
              {walking.steps}: {walking.title}
            </span>
            <span className="flex gap-2">
              <button className={action} disabled={stepIndex <= 0} onClick={() => step(-1)}>
                Previous step
              </button>
              <button
                className={action}
                disabled={!history || stepIndex >= history.milestones.length - 1}
                onClick={() => step(1)}
              >
                Next step
              </button>
              <button className={action} onClick={() => setCruxspaceMoment(null)}>
                Back to now
              </button>
              <button
                className={`${action} border-error/60 text-error`}
                disabled={reverting}
                onClick={() => void revertAll()}
              >
                {reverting ? 'Reverting…' : 'Revert every member to this moment'}
              </button>
            </span>
          </div>
        )}
        {notice && (
          <p role="status" aria-label="Revert result" className="px-4 py-2 text-sm border-b border-border">
            {notice}
          </p>
        )}
        <div className="flex flex-1 min-h-0">
          <aside
            aria-label="Cruxspace story"
            className="w-[26rem] shrink-0 border-r border-border overflow-y-auto p-4 space-y-5 text-sm"
          >
            <section aria-label="About this Cruxspace">
              <h3 className="text-xs uppercase tracking-widest font-mono text-text-muted mb-1">
                What this Cruxspace is for
              </h3>
              <p className="whitespace-pre-wrap">
                {history?.space.brief || 'No brief yet. Edit the Cruxspace to add one.'}
              </p>
            </section>
            <section aria-label="Members">
              <h3 className="text-xs uppercase tracking-widest font-mono text-text-muted mb-1">
                Members and their part
              </h3>
              <ul className="space-y-1">
                {history?.members.map((m, i) => (
                  <li key={m.id} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-1 h-3 w-3 rounded-full shrink-0"
                      style={{ background: laneColor(laneIndex(history, m.id)) }}
                    />
                    <span>
                      <button
                        className="font-medium hover:text-accent cursor-pointer"
                        disabled={!m.available}
                        onClick={() => openMember(m.id, null)}
                      >
                        {m.title}
                      </button>
                      <span className="block text-xs text-text-muted">
                        {m.available
                          ? `${m.tool ?? 'Crux'} · ${m.checkpoints} checkpoints${m.tasks ? ` · ${m.tasks} Tasks` : ''}${m.outputs.length ? ` · shared ${m.outputs.map((o) => o.label).join(', ')}` : ''}${m.transfersIn ? ` · used ${m.transfersIn} output${m.transfersIn > 1 ? 's' : ''}` : ''}`
                          : 'no longer in this Garden'}
                      </span>
                    </span>
                    <span className="sr-only">{i}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Milestones">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-xs uppercase tracking-widest font-mono text-text-muted">
                  Milestones, in order
                </h3>
                {!walking && history && history.milestones.length > 0 && (
                  <button className={action} onClick={() => goTo(history.milestones[0]!)}>
                    Start walkthrough
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-text-muted mb-2">
                <input
                  type="checkbox"
                  checked={everything}
                  onChange={(e) => setEverything(e.target.checked)}
                />
                Include automatic saves
              </label>
              <input
                aria-label="Find milestone"
                className="w-full rounded border border-border bg-bg px-2 py-1 text-xs mb-2"
                placeholder="Find a milestone"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <ol className="space-y-1" aria-label="Milestone list">
                {milestones.map((m) => {
                  const index = (everything ? history!.checkpoints : history!.milestones).indexOf(m);
                  const current = walking?.milestoneId === m.id;
                  return (
                    <li
                      key={m.id}
                      className={`rounded border p-2 ${current ? 'border-accent bg-accent-muted' : selectedId && selectedId === m.nodeId ? 'border-accent' : 'border-transparent hover:bg-surface'}`}
                    >
                      <button
                        className="block w-full text-left text-xs cursor-pointer"
                        aria-current={current ? 'step' : undefined}
                        onClick={() => m.nodeId && select(m.nodeId)}
                      >
                        <span className="text-text-muted">
                          {index + 1}. {when(m.created)} · {m.memberTitle}
                        </span>
                        <span className="block">
                          {m.kind === 'transfer' ? '⇢ ' : m.kind === 'merge' ? '⤵ ' : ''}
                          {m.title}
                        </span>
                      </button>
                      <span className="flex gap-2 mt-1">
                        <button className={action} onClick={() => goTo(m)}>
                          Go to this moment
                        </button>
                        <button className={action} onClick={() => openMember(m.cruxId, m.nodeId)}>
                          Open in {m.memberTitle}
                        </button>
                      </span>
                    </li>
                  );
                })}
                {history && !milestones.length && (
                  <li className="text-xs text-text-muted">No matching milestones.</li>
                )}
              </ol>
            </section>
          </aside>
          <div className="flex-1 min-w-0 flex flex-col">
            <div ref={canvasRef} className="flex-1 min-h-0 relative" data-testid="cruxspace-canvas">
              {display && size.width > 0 && (
                <ErrorBoundary
                  fallback={
                    <p role="status" className="p-6 text-[#e1eee5]">
                      The graph could not be drawn here.
                    </p>
                  }
                >
                  <Suspense
                    fallback={
                      <p role="status" className="p-6 text-[#e1eee5]">
                        Drawing the graph…
                      </p>
                    }
                  >
                    <Canvas2D
                      graph={display}
                      width={size.width}
                      height={size.height}
                      selectedId={selectedId}
                      ancestry={ancestry}
                      onSelect={select}
                      fit={fit}
                      reducedMotion={reducedMotion}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
              {graph && (
                <ul
                  aria-label="Lanes"
                  className="absolute left-3 top-3 flex flex-wrap gap-2 max-w-[80%] text-2xs"
                >
                  {graph.lanes.map((lane, i) => (
                    <li
                      key={lane.id}
                      className="flex items-center gap-1 rounded bg-[#101c19]/80 px-1.5 py-0.5 text-[#e1eee5]"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-full"
                        style={{ background: laneColor(i) }}
                      />
                      {lane.title}
                    </li>
                  ))}
                  <li className="flex items-center gap-1 rounded bg-[#101c19]/80 px-1.5 py-0.5 text-[#e1eee5]">
                    <span
                      aria-hidden
                      className="h-0 w-4 border-t-2 border-dashed border-[#df94ab]"
                    />
                    output used by another member
                  </li>
                </ul>
              )}
            </div>
            {graph && selected && (
              <div className="h-72 shrink-0 border-t border-border overflow-y-auto">
                <div className="flex items-center justify-between gap-2 px-4 pt-3">
                  <p className="text-xs text-text-muted">
                    {graph.lanes.find((l) => l.id === selected.ownerId)?.title}
                  </p>
                  <button
                    className={action}
                    onClick={() =>
                      openMember(
                        history!.laneOwners[selected.ownerId]!,
                        selected.kind === 'copy' ? null : selected.id,
                      )
                    }
                  >
                    Open in Whole Crux Growth
                  </button>
                </div>
                <GrowthInspector
                  key={selected.id}
                  graph={graph}
                  node={selected}
                  onSelect={select}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </Modal>,
    document.body,
  );
}

function laneIndex(history: CruxspaceHistory, memberId: string) {
  return Math.max(
    0,
    history.graph.lanes.findIndex((l) => l.id === memberId),
  );
}
