import { useEffect, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { useTendingRows } from '@/stores/tendingStore';
import { tendingLabel } from '@/services/tending-state';
import { copyIdentity, updateCopyMeta, findWorkingCopy } from '@/services/working-copies';
import type { WorkingCopy } from '@/services/working-copies';
import { formatDateTime } from '@/lib/format';

/**
 * The Tasks area's details (Daniel, 2026-09-19: "an area for the tasks, so
 * you can easily review and update details and status"): the workspace on
 * screen — Main or a task — with its name, its status as Tending sees it,
 * when it began and from which snapshot, the ask it started from, and notes
 * that travel with the task. Name and notes are edited in place.
 */
export default function TaskDetails() {
  const crux = useCruxStore((s) => s.crux);
  const data = useCruxStoreApi();
  const identity = copyIdentity(crux);
  const rows = useTendingRows();
  const row = crux ? rows.find((r) => r.id === crux.id) : null;
  const [copy, setCopy] = useState<WorkingCopy | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState<'name' | 'notes' | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isTask = !!identity;

  useEffect(() => {
    let live = true;
    if (!crux) return;
    if (identity) {
      void findWorkingCopy(crux.id).then((c) => {
        if (!live) return;
        setCopy(c);
        setName(c?.title ?? '');
        setNotes(typeof c?.meta?.notes === 'string' ? (c.meta.notes as string) : '');
      });
    } else {
      setCopy(null);
      setName(crux.title ?? '');
      setNotes(typeof crux.meta?.notes === 'string' ? (crux.meta.notes as string) : '');
    }
    return () => {
      live = false;
    };
  }, [crux?.id, crux?.updated, identity?.cruxId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!crux) return null;
  const flash = (what: string) => {
    setSaved(what);
    setTimeout(() => setSaved(null), 1800);
  };
  const saveName = async () => {
    const next = name.trim();
    if (!next || next === (isTask ? copy?.title : crux.title)) return;
    setSaving('name');
    setError('');
    try {
      await data.getState().updateCrux({ title: next });
      flash('Name saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };
  const saveNotes = async () => {
    const current = isTask ? copy?.meta?.notes : crux.meta?.notes;
    if (notes === (typeof current === 'string' ? current : '')) return;
    setSaving('notes');
    setError('');
    try {
      if (isTask) await updateCopyMeta(crux.id, { notes });
      else await data.getState().updateCrux({ meta: { ...crux.meta, notes } });
      flash('Notes saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };
  const seed = isTask
    ? (copy?.meta?.messages as { role?: string; content?: string }[] | undefined)?.find(
        (m) => m.role === 'user',
      )?.content
    : null;
  const status = row ? tendingLabel(row.state) : null;
  const phase = copy?.phase;

  return (
    <section className="task-details flex flex-col gap-3 text-sm" data-testid="task-details">
      <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted">
        {isTask ? 'This task' : 'Main'}
      </h3>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted">Name</span>
        <Input
          aria-label={isTask ? 'Task name' : 'Crux name'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          disabled={saving === 'name'}
        />
      </label>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {status && (
          <>
            <dt className="text-text-muted">Status</dt>
            <dd data-testid="task-status">
              {status}
              {phase && phase !== 'ready' ? ` · ${phase}` : ''}
            </dd>
          </>
        )}
        {copy && (
          <>
            <dt className="text-text-muted">Started</dt>
            <dd>{formatDateTime(copy.created)}</dd>
            <dt className="text-text-muted">From snapshot</dt>
            <dd className="font-mono">{copy.baseSnapshotId.slice(0, 8)}</dd>
          </>
        )}
        {row?.model && (
          <>
            <dt className="text-text-muted">Model</dt>
            <dd className="font-mono">{row.model}</dd>
          </>
        )}
      </dl>
      {seed && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">The ask</span>
          <p className="text-xs whitespace-pre-wrap text-text">{seed}</p>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-text-muted">Notes</span>
        <textarea
          aria-label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void saveNotes()}
          rows={4}
          placeholder="What this is for, what is decided, what is left…"
          className="w-full rounded-[var(--radius-sm)] border border-input-border hover:border-input-border-hover bg-input px-2.5 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-input-border-active"
          disabled={saving === 'notes'}
        />
      </label>
      {saved && (
        <p role="status" className="text-xs text-text-muted">
          {saved}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      {!isTask && (
        <p className="text-2xs text-text-muted">
          <Button size="sm" variant="ghost" onClick={() => void saveNotes()}>
            Save notes
          </Button>
        </p>
      )}
    </section>
  );
}
