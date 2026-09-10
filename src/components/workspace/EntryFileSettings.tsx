import { useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { copyIdentity } from '@/services/working-copies';
import { entryCandidates, workshopEntry } from '@/lib/workshop-entry';
import { normalizePath, pathOf } from '@/lib/artifact-path';

export default function EntryFileSettings() {
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const update = useCruxStore((s) => s.updateCrux);
  const locked = useCruxStore((s) => s.closing || s.viewingSnapshotId !== null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (!crux) return null;
  const copy = copyIdentity(crux);
  const candidates = entryCandidates(artifacts);
  const entry = workshopEntry(crux, artifacts);
  const selected = crux.meta?.settings?.entryFile ?? '';
  return (
    <section className="p-3 border-b border-border space-y-2" aria-label="Crux settings">
      <label htmlFor="crux-entry-file" className="block text-xs font-medium">
        Entry file
      </label>
      <select
        id="crux-entry-file"
        value={selected}
        disabled={saving || locked || (!!copy && copy.phase !== 'ready')}
        className="w-full min-w-0 p-2 text-xs bg-surface-solid text-text border border-border rounded-[var(--radius-sm)]"
        onChange={async (e) => {
          const entryFile = e.target.value || null;
          setSaving(true);
          setError('');
          try {
            await update({ meta: { settings: { ...crux.meta?.settings, entryFile } } });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <option value="">Automatic</option>
        {selected && !entry.artifact && <option value={selected}>{selected} (unavailable)</option>}
        {candidates.map((a) => (
          <option key={a.id} value={normalizePath(pathOf(a))}>
            {pathOf(a)}
          </option>
        ))}
      </select>
      <p className="text-xs text-text-muted">
        Clean view always opens this Artifact. This choice travels with the Crux; it does not change
        the published site's home page.
      </p>
      {!selected && entry.artifact && (
        <p className="text-xs text-text-muted">Currently opens {pathOf(entry.artifact)}.</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </section>
  );
}
