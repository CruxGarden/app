import { useEffect, useRef, useState } from 'react';
import { Button, Input, SectionLabel, fieldClass } from '@/components/ui';
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
  const baseline = useRef({ id: '', name: '', notes: '' });

  useEffect(() => {
    let live = true;
    if (!crux) return;
    const applyDetails = (nextName: string, nextNotes: string) => {
      const previous = baseline.current;
      const changedWorkspace = previous.id !== crux.id;
      baseline.current = { id: crux.id, name: nextName, notes: nextNotes };
      setName((current) => (changedWorkspace || current === previous.name ? nextName : current));
      setNotes((current) => (changedWorkspace || current === previous.notes ? nextNotes : current));
    };
    if (identity) {
      void findWorkingCopy(crux.id)
        .then((c) => {
          if (!live) return;
          setCopy(c);
          applyDetails(
            c?.title ?? '',
            typeof c?.meta?.notes === 'string' ? (c.meta.notes as string) : '',
          );
        })
        .catch((e) => {
          if (live) setError((e as Error).message);
        });
    } else {
      setCopy(null);
      applyDetails(
        crux.title ?? '',
        typeof crux.meta?.notes === 'string' ? (crux.meta.notes as string) : '',
      );
    }
    return () => {
      live = false;
    };
  }, [crux?.id, crux?.updated, crux?.title, crux?.meta?.notes, identity?.cruxId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (baseline.current.id === crux.id) baseline.current.name = next;
      setName((current) => (current === name ? next : current));
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
      if (baseline.current.id === crux.id) baseline.current.notes = notes;
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
      <SectionLabel as="h3" tone="muted">
        {isTask ? 'This task' : 'Main'}
      </SectionLabel>
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
            <dt className="text-text-muted">Starting state</dt>
            <dd className="font-mono">
              {copy.baseState ? 'Retained' : copy.baseSnapshotId?.slice(0, 8)}
            </dd>
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
          className={fieldClass(undefined, 'h-auto py-2 resize-y')}
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
        <Button
          size="sm"
          variant="ghost"
          className="self-start -ml-3"
          onClick={() => void saveNotes()}
        >
          Save notes
        </Button>
      )}
    </section>
  );
}
