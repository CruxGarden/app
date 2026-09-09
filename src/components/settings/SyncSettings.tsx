import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import * as syncApi from '@/api/sync';
import { exportGarden, confirmAndImportGarden } from '@/services/garden-io';
import { Panel, Spinner, Button, Toggle } from '@/components/ui';
import {
  isAutoBackupOn,
  setAutoBackup,
  autoBackupPause,
  lastGardenBackupAt,
  AUTO_BACKUP_CHANGED,
} from '@/services/auto-backup';
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
import { confirmDialog } from '@/stores/dialogStore';
import { notifyUsageChanged } from '@/lib/usage-events';
import { useGardenStore } from '@/stores/gardenStore';
import { cruxesChangedSince } from '@/services/drift';
import * as usageApi from '@/api/usage';

export default function SyncSettings() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [gardenStatus, setGardenStatus] = useState<GardenStatus | null>(null);
  const [budget, setBudget] = useState<usageApi.BudgetLine | null>(null);
  // Automatic backup (RESILIENCE-PLAN §2a): the setting, and what it last did
  const [auto, setAuto] = useState(() => isAutoBackupOn());
  const [autoPause, setAutoPause] = useState<string | null>(() => autoBackupPause());
  const [autoLast, setAutoLast] = useState<string | null>(() => lastGardenBackupAt());
  useEffect(() => {
    const sync = () => {
      setAuto(isAutoBackupOn());
      setAutoPause(autoBackupPause());
      setAutoLast(lastGardenBackupAt());
    };
    window.addEventListener(AUTO_BACKUP_CHANGED, sync);
    return () => window.removeEventListener(AUTO_BACKUP_CHANGED, sync);
  }, []);
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
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    usageApi
      .me()
      .then((u) => !cancelled && setBudget(u.budgets.storage))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, gardenStatus]);

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
      notifyUsageChanged();
    } catch (err) {
      console.error('Garden push failed:', err);
      setError('Push failed');
      setStatus('');
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    // Scenario 6: cruxes changed here after the cloud copy was made would be
    // overwritten by a whole-garden pull. Name them; make it a choice.
    if (gardenStatus) {
      const changed = await cruxesChangedSince(
        useGardenStore.getState().allCruxes,
        gardenStatus.syncedAt,
      );
      if (changed.length) {
        const names = changed
          .slice(0, 5)
          .map((c) => c.title || c.slug)
          .join(', ');
        const more = changed.length > 5 ? ` and ${changed.length - 5} more` : '';
        if (
          !(await confirmDialog({
            title: 'Newer work on this machine',
            message: `${changed.length} crux${changed.length === 1 ? '' : 'es'} changed here after the cloud backup was made: ${names}${more}. Pulling the garden replaces them with the older copies. Push the garden first if you want to keep them.`,
            confirmLabel: 'Pull anyway',
            danger: true,
          }))
        )
          return;
      }
    }
    setPulling(true);
    setError('');
    setStatus('Downloading from cloud...');
    try {
      const blob = await syncApi.pullGarden();
      setStatus('Importing garden...');

      const imported = await confirmAndImportGarden({
        data: blob,
        onProgress: setStatus,
        onPostImport: async () => {
          await useAppStore.getState().ensureAuthor();
        },
      });

      if (!imported) setStatus('');
      notifyUsageChanged();
    } catch (err) {
      console.error('Garden pull failed:', err);
      setError('Pull failed');
      setStatus('');
    } finally {
      setPulling(false); // success path used to leave the button spinning forever
    }
  };

  const handleDeleteCrux = async (cruxId: string) => {
    setDeletingId(cruxId);
    try {
      await syncApi.deleteSyncedCrux(cruxId);
      setSyncedCruxes((prev) => prev.filter((c) => c.cruxId !== cruxId));
      notifyUsageChanged();
    } catch {
      setError('Failed to delete synced crux');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteGarden = async () => {
    if (
      !(await confirmDialog({
        title: 'Delete cloud backup',
        message:
          'Delete your cloud garden backup? This cannot be undone. Your local garden is not affected.',
        confirmLabel: 'Delete backup',
        danger: true,
      }))
    )
      return;
    setDeletingGarden(true);
    setError('');
    try {
      await syncApi.deleteGarden();
      setGardenStatus(null);
      setStatus('Cloud backup deleted');
      notifyUsageChanged();
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
          {/* Automatic backup */}
          <div
            className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-border"
            data-testid="auto-backup"
          >
            <div className="min-w-0">
              <p className="text-sm text-text">Back up my garden to crux.garden automatically</p>
              <p className="text-xs text-text-muted mt-0.5">
                A crux is backed up ten minutes after it goes quiet, the whole garden once a day,
                and every crux you share. A published site is not a backup — this is.
              </p>
              {auto && autoPause && (
                <p
                  role="alert"
                  className="text-xs text-error mt-1.5"
                  data-testid="auto-backup-paused"
                >
                  Paused — {autoPause} Switch it off and on to try again.
                </p>
              )}
              {auto && !autoPause && (
                <p
                  className="text-xs text-text-muted mt-1.5 font-mono"
                  data-testid="auto-backup-status"
                >
                  {autoLast
                    ? `Garden backed up ${formatDateTime(autoLast)}`
                    : 'On — the first garden backup runs shortly'}
                </p>
              )}
            </div>
            <Toggle checked={auto} onChange={(on) => setAutoBackup(on)} label="Automatic backup" />
          </div>

          {/* Garden backup */}
          <h3 className="text-2xs font-mono text-caption mb-2 uppercase tracking-wider">
            Garden Backup
          </h3>

          {gardenStatus && (
            <p className="text-xs text-text-muted mb-3">
              Last pushed: {formatDateTime(gardenStatus.syncedAt)} ({formatBytes(gardenStatus.size)}
              )
            </p>
          )}
          {budget && budget.limit > 0 && budget.used / budget.limit >= 0.8 && (
            <p
              role={budget.over ? 'alert' : undefined}
              className={cn('text-xs mb-3', budget.over ? 'text-error' : 'text-text-muted')}
              data-testid="settings-sync-budget"
            >
              {budget.over
                ? `Storage is over your plan (${formatBytes(budget.used)} of ${formatBytes(budget.limit)}) — pushes are refused above twice the limit.`
                : `Storage is at ${Math.round((budget.used / budget.limit) * 100)}% of your plan — a push may soon be refused.`}
            </p>
          )}

          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePush}
              disabled={busy}
              loading={pushing}
            >
              {pushing ? 'Pushing...' : 'Push garden'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePull}
              disabled={busy}
              loading={pulling}
            >
              {pulling ? 'Pulling...' : 'Pull garden'}
            </Button>
            {gardenStatus && (
              <Button
                variant="danger"
                size="sm"
                onClick={handleDeleteGarden}
                disabled={busy}
                loading={deletingGarden}
              >
                {deletingGarden ? 'Deleting...' : 'Delete backup'}
              </Button>
            )}
          </div>

          {/* Synced cruxes */}
          <div className="border-t border-border my-4" />
          <h3 className="text-2xs font-mono text-caption mb-2 uppercase tracking-wider">
            Synced Cruxes
          </h3>

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
                    <span className="text-text font-medium">{c.title}</span>
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
