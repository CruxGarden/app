import { useEffect, useState } from 'react';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { getServices } from '@/services';
import { pathOf } from '@/lib/artifact-path';
import { copyIdentity } from '@/services/working-copies';
import {
  NOTEBOOK_PAGE_ROUTE,
  setNotebookLayout,
  type NotebookLayout,
} from '@/services/notebook-sharing';
import { trackWorkspacePromise } from '@/stores/workspaceSelection';

export default function NotesSharingSettings() {
  const workspace = useCruxStoreApi();
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const locked = useCruxStore((s) => s.closing || s.viewingSnapshotId !== null);
  const config = artifacts.find((file) => pathOf(file) === 'notebook/publish.json');
  const configId = config?.id;
  const configFingerprint = config?.fingerprint;
  const supported = artifacts.some((file) => pathOf(file) === NOTEBOOK_PAGE_ROUTE);
  const [layout, setLayout] = useState<NotebookLayout>('single-page');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    if (crux?.kind === 'notes' && configId) {
      void getServices()
        .artifact.readContent(configId)
        .then((content) => {
          const value = JSON.parse(content).layout ?? 'single-page';
          if (!['single-page', 'separate-pages'].includes(value))
            throw new Error('Unknown public layout in notebook/publish.json.');
          if (active) {
            setLayout(value);
            setLoaded(true);
            setError('');
          }
        })
        .catch((err: Error) => {
          if (active) setError(err.message);
        });
    }
    return () => {
      active = false;
    };
  }, [crux?.id, crux?.kind, configId, configFingerprint]);
  if (crux?.kind !== 'notes') return null;
  const copy = copyIdentity(crux);
  return (
    <section
      className="p-3 border-b border-border space-y-2"
      aria-label="Notebook sharing settings"
    >
      <label htmlFor="notebook-public-layout" className="block text-xs font-medium">
        Public notebook layout
      </label>
      <select
        id="notebook-public-layout"
        value={layout}
        disabled={!loaded || !supported || saving || locked || (!!copy && copy.phase !== 'ready')}
        className="w-full min-w-0 p-2 text-xs bg-surface-solid text-text border border-border rounded-[var(--radius-sm)]"
        onChange={async (event) => {
          const next = event.target.value as NotebookLayout;
          setSaving(true);
          setError('');
          try {
            await trackWorkspacePromise(workspace, setNotebookLayout(workspace, next));
            setLayout(next);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <option value="single-page">Single-page reader</option>
        <option value="separate-pages">Separate page per note</option>
      </select>
      <p className="text-xs text-text-muted">
        Share selected notes as one searchable reader or as individual HTML pages that work without
        JavaScript. Use Share to update the website; switching layouts changes note URLs.
      </p>
      {!supported && (
        <p className="text-xs text-text-muted">
          This notebook uses an older or customized reader. An updated public reader is required to
          choose its layout.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
    </section>
  );
}
