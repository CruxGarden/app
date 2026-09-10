import {
  useTendingNotifications,
  enableTendingNotifications,
} from '@/services/tending-notifications';
import { getModelShortName, resolveModel } from '@/ai/providers';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTendingCatalog, useTendingRows, type TendingRow } from '@/stores/tendingStore';
import {
  attentionCount,
  tendingLabel,
  type Attention,
  type TendingTarget,
} from '@/services/tending-state';
import { tendingPath, validateTendingTarget, stopTendingTarget } from '@/services/tending-actions';
import { confirmDialog } from '@/stores/dialogStore';
import { Button } from '@/components/ui';

function elapsed(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  if (!Number.isFinite(seconds)) return '';
  return seconds < 60
    ? 'just now'
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : `${Math.floor(seconds / 3600)}h ago`;
}
export default function Tending() {
  const rows = useTendingRows();
  const notifications = useTendingNotifications();
  const { loading, error: loadError } = useTendingCatalog();
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('current');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    heading.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const current = rows.filter((r) => !['merged', 'archived'].includes(r.phase));
  const count = attentionCount(current.map((r) => r.state));
  const working = current.filter((r) => ['working', 'checking'].includes(r.state.activity)).length;
  const queued = current.filter((r) => r.state.queued > 0 || r.state.activity === 'queued').length;
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || !['merged', 'archived'].includes(r.phase)) &&
      (filter !== 'attention' || r.state.attention.length > 0) &&
      `${r.cruxTitle} ${r.title}`.toLowerCase().includes(query.toLowerCase()),
  );
  const groups = new Map<string, TendingRow[]>();
  for (const row of visible) groups.set(row.cruxId, [...(groups.get(row.cruxId) ?? []), row]);
  function open(row: TendingRow, attention?: Attention) {
    setError('');
    const target: TendingTarget = { ...row.state, attentionId: attention?.id };
    try {
      if (target.lifetimeId) validateTendingTarget(target);
      navigate(tendingPath(target), { state: target.lifetimeId ? { tending: target } : undefined });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function stop(row: TendingRow) {
    const target: TendingTarget = { ...row.state };
    setError('');
    try {
      validateTendingTarget(target);
      const ok = await confirmDialog({
        title: `Stop ${row.title}?`,
        message: `Stop the current turn in ${row.cruxTitle} · ${row.title}? Its saved history and queued messages remain available.`,
        confirmLabel: 'Stop task',
        danger: true,
      });
      if (ok) stopTendingTarget(target);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-text-muted mb-1">Your garden at work</p>
          <h1 ref={heading} tabIndex={-1} className="text-xl font-display text-heading">
            Tending
          </h1>
          <p className="text-sm text-text-muted mt-2">
            See what is growing, what needs you, and what is ready to review.
          </p>
        </div>
        <Link to="/home" className="text-sm text-accent hover:underline shrink-0">
          Home Garden
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3" aria-label="Garden activity">
        {[
          ['Needs tending', count],
          ['Working', working],
          ['Tasks with a queue', queued],
        ].map(([label, value]) => (
          <div key={label} className="bg-panel border border-border rounded-[var(--radius)] p-3">
            <p className="text-xl font-display text-heading">{value}</p>
            <p className="text-xs text-text-muted mt-1">{label}</p>
          </div>
        ))}
      </div>
      <p className="sr-only" role="status">
        {count} tasks need tending. {working} working.
      </p>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search Tending"
          placeholder="Find a Crux or Task…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-48 bg-panel border border-border rounded p-2 text-sm"
        />
        <select
          aria-label="Show tasks"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-panel border border-border rounded p-2 text-sm"
        >
          <option value="current">Current work</option>
          <option value="attention">Needs tending</option>
          <option value="all">All, including completed</option>
        </select>
      </div>
      <label className="flex gap-2 items-center text-sm text-text-muted">
        <input
          type="checkbox"
          checked={notifications.enabled}
          onChange={(e) => void enableTendingNotifications(e.target.checked)}
        />
        Desktop notifications when work needs tending
      </label>
      {notifications.error && (
        <p role="status" className="text-sm text-text-muted">
          {notifications.error}
        </p>
      )}
      {(error || loadError) && (
        <p role="alert" className="text-error">
          {error || loadError}
        </p>
      )}
      {loading && <p role="status">Loading your garden…</p>}
      {!loading && !visible.length && (
        <div className="bg-panel border border-border rounded p-8 text-center text-text-muted">
          {filter === 'attention'
            ? 'Nothing needs tending right now.'
            : query
              ? 'No work matches your search.'
              : 'Create a Crux in your Home Garden to get started.'}
        </div>
      )}
      {[...groups].map(([id, group]) => (
        <section
          key={id}
          aria-label={group[0]!.cruxTitle}
          className="bg-panel border border-border rounded-[var(--radius)] overflow-hidden"
        >
          <div className="px-4 py-2 border-b border-border flex justify-between gap-3">
            <h2 className="font-display text-base text-heading">{group[0]!.cruxTitle}</h2>
            <span className="text-xs text-text-muted">
              {attentionCount(group.map((r) => r.state))} need tending
            </span>
          </div>
          <ul className="divide-y divide-border">
            {group.map((row) => (
              <li
                key={row.id}
                data-testid={`tending-row-${row.id}`}
                className="px-4 py-2 space-y-1"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-text">{row.title}</h3>
                    <p className="text-xs text-text-muted mt-1">
                      {getModelShortName(
                        row.state.model ??
                          resolveModel(row.model === 'Default model' ? undefined : row.model),
                      ) ??
                        row.state.model ??
                        row.model}{' '}
                      · {row.state.lifetimeId ? 'Open workspace' : 'Closed workspace'}
                      {['merged', 'archived'].includes(row.phase) ? ` · ${row.phase}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {' '}
                    <span className="text-xs font-medium text-accent bg-accent-muted rounded px-2 py-1">
                      {tendingLabel(row.state)}
                    </span>{' '}
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => open(row)}
                        aria-label={`Open ${row.title}`}
                      >
                        Open
                      </Button>
                      {row.state.canStop && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void stop(row)}
                          aria-label={`Stop ${row.title}`}
                        >
                          Stop
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {row.state.attention.length > 0 && (
                  <ul className="space-y-2">
                    {row.state.attention.map((attention, i) => (
                      <li
                        key={attention.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          <span>{attention.reason}</span>{' '}
                          <span className="text-text-muted text-xs ml-2">
                            {elapsed(attention.since, now)}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => open(row, attention)}
                          aria-label={`${attention.kind === 'permission' ? 'Answer' : 'Review'} ${row.title}${row.state.attention.length > 1 ? ` item ${i + 1}` : ''}`}
                        >
                          {attention.kind === 'permission' ? 'Answer' : 'Review'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <p className="text-xs text-text-muted">
                    {row.state.verification.status === 'not-checked'
                      ? 'Not checked'
                      : row.state.verification.status === 'checking'
                        ? 'Checking result…'
                        : `${row.state.verification.status === 'passed' ? 'Check passed' : 'Check found problems'} · saved snapshot ${row.state.verification.snapshotId?.slice(0, 8)}`}
                    {row.state.verification.note ? ` · ${row.state.verification.note}` : ''}
                    {row.state.activity === 'queued' && row.state.queued === 0
                      ? ' · Waiting for another Task to finish'
                      : ''}
                    {row.state.queued > 0 ? ` · ${row.state.queued} queued` : ''}
                    {row.state.evidence === 'unknown' || row.state.evidence === 'inferred'
                      ? ` · ${row.state.evidence} status`
                      : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-text-muted">
        Work continues while you move around the garden. Keep the app window open while turns are
        running.
      </p>
    </div>
  );
}
