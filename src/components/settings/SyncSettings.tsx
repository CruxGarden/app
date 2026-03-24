import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import * as syncApi from '@/api/sync';
import { exportGarden, confirmAndImportGarden } from '@/services/garden-io';
import { Panel, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { GardenStatus, SyncedCrux } from '@/api/sync';

const btnClass = cn(
  'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
  'bg-surface border border-border text-text hover:bg-accent-muted transition-colors cursor-pointer',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function SyncSettings() {
  const { isAuthenticated } = useAuthStore();

  const [gardenStatus, setGardenStatus] = useState<GardenStatus | null>(null);
  const [syncedCruxes, setSyncedCruxes] = useState<SyncedCrux[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [gs, cruxes] = await Promise.all([
        syncApi.getGardenStatus(),
        syncApi.listSyncedCruxes(),
      ]);
      setGardenStatus(gs);
      setSyncedCruxes(cruxes);
    } catch {
      // Not critical — just show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) refresh();
  }, [isAuthenticated, refresh]);

  if (!isAuthenticated) return null;

  const handlePush = async () => {
    setPushing(true);
    setError('');
    setStatus('Exporting garden...');
    try {
      const result = await exportGarden({ onProgress: setStatus });
      setStatus('Uploading to cloud...');
      const meta = await syncApi.pushGarden(result.blob);
      setGardenStatus(meta);
      setStatus('Garden pushed successfully');
    } catch (err) {
      console.error('Garden push failed:', err);
      setError('Push failed');
      setStatus('');
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    setError('');
    setStatus('Downloading from cloud...');
    try {
      const blob = await syncApi.pullGarden();
      setStatus('Importing garden...');

      const imported = await confirmAndImportGarden({
        data: blob,
        onProgress: setStatus,
        onPostImport: async () => { await useAppStore.getState().ensureAuthor(); },
      });

      if (!imported) {
        setStatus('');
        setPulling(false);
      }
    } catch (err) {
      console.error('Garden pull failed:', err);
      setError('Pull failed');
      setStatus('');
      setPulling(false);
    }
  };

  const handleDeleteCrux = async (cruxId: string) => {
    setDeletingId(cruxId);
    try {
      await syncApi.deleteSyncedCrux(cruxId);
      setSyncedCruxes((prev) => prev.filter((c) => c.cruxId !== cruxId));
    } catch {
      setError('Failed to delete synced crux');
    } finally {
      setDeletingId(null);
    }
  };

  const busy = pushing || pulling;

  return (
    <Panel padding="md">
      <h2 className="font-display text-sm font-medium text-accent mb-4">Cloud Sync</h2>

      {/* Garden backup */}
      <h3 className="text-xs font-mono text-text-muted mb-2 uppercase tracking-wider">Garden Backup</h3>

      {gardenStatus && (
        <p className="text-xs text-text-muted mb-3">
          Last pushed: {formatDate(gardenStatus.syncedAt)} ({formatSize(gardenStatus.size)})
        </p>
      )}

      <div className="flex items-center gap-2 mb-4">
        <button onClick={handlePush} disabled={busy} className={btnClass}>
          {pushing ? <><Spinner size={12} /> Pushing...</> : 'Push garden'}
        </button>
        <button onClick={handlePull} disabled={busy} className={btnClass}>
          {pulling ? <><Spinner size={12} /> Pulling...</> : 'Pull garden'}
        </button>
      </div>

      {/* Synced cruxes */}
      <div className="border-t border-border my-4" />
      <h3 className="text-xs font-mono text-text-muted mb-2 uppercase tracking-wider">Synced Cruxes</h3>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Spinner size={12} /> Loading...
        </div>
      ) : syncedCruxes.length === 0 ? (
        <p className="text-xs text-text-muted">No cruxes synced to cloud yet.</p>
      ) : (
        <div className="space-y-2">
          {syncedCruxes.map((c) => (
            <div key={c.cruxId} className="flex items-center justify-between text-xs">
              <div>
                <span className="text-text font-mono">{c.title}</span>
                <span className="text-text-muted ml-2">
                  {formatSize(c.size)} &middot; {formatDate(c.updatedAt)}
                </span>
              </div>
              <button
                onClick={() => handleDeleteCrux(c.cruxId)}
                disabled={deletingId === c.cruxId}
                className="text-error hover:text-error/80 transition-colors cursor-pointer"
              >
                {deletingId === c.cruxId ? <Spinner size={10} /> : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {status && <p className="text-xs font-mono text-text-muted mt-3">{status}</p>}
      {error && <p className="text-xs font-mono text-error mt-3">{error}</p>}
    </Panel>
  );
}
