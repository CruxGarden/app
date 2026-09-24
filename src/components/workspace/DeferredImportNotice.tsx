import { useState, useSyncExternalStore } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import {
  deferredImportSnapshot,
  deferredImportRunning,
  readDeferredImport,
  retryDeferredImport,
  dismissDeferredImport,
  subscribeDeferredImports,
} from '@/services/deferred-import';

export default function DeferredImportNotice() {
  const id = useCruxStore((s) => s.crux?.id);
  const historical = useCruxStore((s) => !!s.viewingSnapshotId);
  useSyncExternalStore(subscribeDeferredImports, () =>
    id ? `${deferredImportSnapshot(id)}:${deferredImportRunning(id)}` : '',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = id ? readDeferredImport(id) : null;
  if (!id || historical || !request || ['complete', 'dismissed'].includes(request.state))
    return null;
  const running = deferredImportRunning(id);
  const interrupted = !running && ['uncertain', 'failed', 'dispatched'].includes(request.state);
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      role="status"
      aria-label="File import"
      className="shrink-0 border-b border-border bg-panel px-3 py-2 text-xs text-text-muted"
    >
      {interrupted
        ? 'File import wasn’t confirmed. Check Workshop before retrying; it may already have imported the file.'
        : running
          ? 'Importing your file…'
          : 'Your file is ready to import when Workshop opens.'}
      {interrupted && (
        <span className="ml-3 inline-flex gap-3">
          <button
            disabled={busy}
            className="text-accent cursor-pointer"
            onClick={() => void act(() => retryDeferredImport(id))}
          >
            Retry import
          </button>
          <button
            disabled={busy}
            className="cursor-pointer"
            onClick={() => void act(() => dismissDeferredImport(id))}
          >
            Dismiss
          </button>
        </span>
      )}
      {(error || request.error) && <p className="mt-1 text-error">{error || request.error}</p>}
    </div>
  );
}
