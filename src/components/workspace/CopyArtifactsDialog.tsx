import { useEffect, useId, useState } from 'react';
import type { Crux } from '@/api/types';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui';
import { fieldClass } from '@/components/ui/field-class';
import { artifactDestinations, copyArtifacts } from '@/services/copy-artifacts';

export interface ArtifactCopySelection {
  sourceId: string;
  gardenId?: string;
  paths: string[];
}

/** A deliberate copy: the destination owns independent files. */
export default function CopyArtifactsDialog({
  selection,
  onClose,
}: {
  selection: ArtifactCopySelection;
  onClose: () => void;
}) {
  const targetId = useId();
  const [destinations, setDestinations] = useState<Crux[]>([]);
  const [target, setTarget] = useState('');
  const [folder, setFolder] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string[] | null>(null);
  useEffect(() => {
    let active = true;
    void artifactDestinations(selection.gardenId, selection.sourceId)
      .then((items) => {
        if (active) {
          setDestinations(items);
          setTarget(items[0]?.id ?? '');
        }
      })
      .catch((e) => {
        if (active) setError(String(e.message ?? e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selection]);
  return (
    <Modal
      open
      title="Copy to another Crux"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {copied ? (
        <div className="space-y-4">
          <p role="status">
            Copied {copied.length} file{copied.length === 1 ? '' : 's'} to{' '}
            {destinations.find((c) => c.id === target)?.title || 'the receiving Crux'}. Your
            originals stay here.
          </p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            void copyArtifacts({ ...selection, targetId: target, folder })
              .then(setCopied)
              .catch((e) => setError(String(e.message ?? e)))
              .finally(() => setBusy(false));
          }}
        >
          <p className="text-sm text-text-muted">
            Copy {selection.paths.length} selected file{selection.paths.length === 1 ? '' : 's'}.
            Current edits are saved first. Existing destination files will not be replaced.
          </p>
          <div className="text-sm">
            <label htmlFor={targetId} className="block">
              Receiving Crux
            </label>
            <select
              id={targetId}
              className={fieldClass()}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy || loading}
              required
            >
              <option value="">{loading ? 'Loading Cruxes…' : 'Choose a Crux'}</option>
              {destinations.map((crux) => (
                <option key={crux.id} value={crux.id}>
                  {crux.title || crux.slug}
                </option>
              ))}
            </select>
          </div>
          {!loading && !destinations.length && (
            <p className="text-sm">
              Create another Crux in this Garden first, then return here to copy your files.
            </p>
          )}
          <label className="block text-sm">
            Receiving folder (optional)
            <input
              className={fieldClass()}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="For example: public/shared"
              disabled={busy}
            />
          </label>
          <p className="text-xs text-text-muted">
            Source paths are kept beneath that folder. For an Astro website, use public to make
            assets available to the page. Copies do not change when the original changes.
          </p>
          <ul className="max-h-36 overflow-auto text-xs font-mono">
            {selection.paths.map((path) => (
              <li key={path}>
                {folder ? `${folder.replace(/\/$/, '')}/` : ''}
                {path}
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!target || loading || busy}>
              Copy files
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
