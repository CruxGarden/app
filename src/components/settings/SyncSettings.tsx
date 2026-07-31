import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import * as syncApi from '@/api/sync';
import { exportGarden, confirmAndImportGarden } from '@/services/garden-io';
import { Panel, Spinner, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

const ChevronIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn('text-text-muted', collapsed ? '-rotate-90' : 'rotate-0')}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
import type { GardenStatus, SyncedCrux } from '@/api/sync';
import { formatBytes, formatDateTime } from '@/lib/format';

export default function SyncSettings() {
  const { isAuthenticated } = useAuthStore();

  const [gardenStatus, setGardenStatus] = useState<GardenStatus | null>(null);
  const [syncedCruxes, setSyncedCruxes] = useState<SyncedCrux[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingGarden, setDeletingGarden] = useState(false);
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

  const handleDeleteGarden = async () => {
    if (!confirm('Delete your cloud garden backup? This cannot be undone. Your local garden is not affected.')) return;
    setDeletingGarden(true);
    setError('');
    try {
      await syncApi.deleteGarden();
      setGardenStatus(null);
      setStatus('Cloud backup deleted');
    } catch {
      setError('Failed to delete cloud backup');
    } finally {
      setDeletingGarden(false);
    }
  };

  const busy = pushing || pulling || deletingGarden;

  return (
    <Panel padding="md">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 w-full cursor-pointer group"
      >
        <ChevronIcon collapsed={collapsed} />
        <h2 className="font-display text-sm font-medium text-accent">Sync</h2>
      </button>

      {!collapsed && (
      <div className="mt-5">
      {/* Garden backup */}
      <h3 className="text-xs font-mono text-text-muted mb-2 uppercase tracking-wider">Garden Backup</h3>

      {gardenStatus && (
        <p className="text-xs text-text-muted mb-3">
          Last pushed: {formatDateTime(gardenStatus.syncedAt)} ({formatBytes(gardenStatus.size)})
        </p>
      )}

      <div className="flex items-center gap-2 mb-4">
        <Button variant="secondary" size="sm" onClick={handlePush} disabled={busy} loading={pushing}>
          {pushing ? 'Pushing...' : 'Push garden'}
        </Button>
        <Button variant="secondary" size="sm" onClick={handlePull} disabled={busy} loading={pulling}>
          {pulling ? 'Pulling...' : 'Pull garden'}
        </Button>
        {gardenStatus && (
          <Button variant="danger" size="sm" onClick={handleDeleteGarden} disabled={busy} loading={deletingGarden}>
            {deletingGarden ? 'Deleting...' : 'Delete backup'}
          </Button>
        )}
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
                  {formatBytes(c.size)} &middot; {formatDateTime(c.updatedAt)}
                </span>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDeleteCrux(c.cruxId)}
                disabled={deletingId === c.cruxId}
                loading={deletingId === c.cruxId}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {status && <p className="text-xs font-mono text-text-muted mt-3">{status}</p>}
      {error && <p className="text-xs font-mono text-error mt-3">{error}</p>}
      </div>
      )}
    </Panel>
  );
}
