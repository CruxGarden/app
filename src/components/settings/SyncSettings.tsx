import { useState, useEffect, useCallback, useRef } from 'react';
import SettingsSection from './SettingsSection';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import * as syncApi from '@/api/sync';
import { assertAuthCurrent, captureAuth, type AuthContext } from '@/api/session';
import { confirmAndImportGarden } from '@/services/garden-io';
import { backupGarden } from '@/services/backup';
import { Spinner, Button, Toggle, SectionLabel } from '@/components/ui';
import {
  isAutoBackupOn,
  setAutoBackup,
  autoBackupPause,
  lastGardenBackupAt,
  AUTO_BACKUP_CHANGED,
} from '@/services/auto-backup';
import { cn } from '@/lib/cn';

import type { GardenStatus, SyncedCrux } from '@/api/sync';
import { formatBytes, formatDateTime } from '@/lib/format';
import { confirmDialog } from '@/stores/dialogStore';
import { notifyUsageChanged } from '@/lib/usage-events';
import { useGardenStore } from '@/stores/gardenStore';
import { cruxesChangedSince } from '@/services/drift';
import * as usageApi from '@/api/usage';

export default function SyncSettings() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accountId = useAuthStore((s) => s.account?.id);
  if (!isAuthenticated || !accountId) return null;
  const context = captureAuth();
  // Backup metadata belongs to this exact connection. Disconnecting, switching
  // accounts or reconnecting must discard its state before showing another one.
  return (
    <ConnectedSyncSettings
      key={`${context.endpoint}:${context.revision}:${accountId}`}
      accountId={accountId}
      context={context}
    />
  );
}

function ConnectedSyncSettings({
  accountId,
  context,
}: {
  accountId: string;
  context: AuthContext;
}) {
  const [owner] = useState(() => ({ accountId, context }));
  const live = useRef(true);
  const loadGeneration = useRef(0);
  const isCurrent = useCallback(() => {
    const auth = useAuthStore.getState();
    if (!live.current || !auth.isAuthenticated || auth.account?.id !== owner.accountId)
      return false;
    try {
      assertAuthCurrent(owner.context);
      return true;
    } catch {
      return false;
    }
  }, [owner]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingGarden, setDeletingGarden] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!isCurrent()) return;
    const generation = ++loadGeneration.current;
    const canApply = () => isCurrent() && generation === loadGeneration.current;
    setLoading(true);
    setLoadError('');
    setGardenStatus(null);
    setSyncedCruxes([]);
    try {
      const [gs, cruxes] = await Promise.all([
        syncApi.getGardenStatus(owner.context),
        syncApi.listSyncedCruxes(owner.context),
      ]);
      if (!canApply()) return;
      setGardenStatus(gs);
      setSyncedCruxes(cruxes);
    } catch {
      if (canApply())
        setLoadError('Could not load cloud backups. Check your connection and try again.');
    } finally {
      if (canApply()) setLoading(false);
    }
  }, [isCurrent, owner.context]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    usageApi
      .me()
      .then((u) => !cancelled && isCurrent() && setBudget(u.budgets.storage))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isCurrent, gardenStatus]);

  const handlePush = async () => {
    setPushing(true);
    setError('');
    setStatus('Exporting garden...');
    try {
      const meta = await backupGarden((message) => {
        if (isCurrent()) setStatus(message);
      }, owner.context);
      if (!isCurrent()) return;
      setGardenStatus(meta);
      setStatus('Garden pushed successfully');
      notifyUsageChanged();
    } catch (err) {
      console.error('Garden push failed:', err);
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : 'Push failed');
      setStatus('');
    } finally {
      if (isCurrent()) setPushing(false);
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
      const blob = await syncApi.pullGarden(owner.context);
      setStatus('Importing garden...');

      const imported = await confirmAndImportGarden({
        data: blob,
        beforeCommit: () => assertAuthCurrent(owner.context),
        onProgress: (message) => {
          if (isCurrent()) setStatus(message);
        },
        onPostImport: async () => {
          await useAppStore.getState().ensureAuthor();
        },
      });

      if (!imported) setStatus('');
      notifyUsageChanged();
    } catch (err) {
      console.error('Garden pull failed:', err);
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : 'Pull failed');
      setStatus('');
    } finally {
      if (isCurrent()) setPulling(false);
    }
  };

  const handleDeleteCrux = async (cruxId: string) => {
    setDeletingId(cruxId);
    try {
      await syncApi.deleteSyncedCrux(cruxId, owner.context);
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
      await syncApi.deleteGarden(owner.context);
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
    <SettingsSection title="Sync" collapsible>
      <div>
        {/* Automatic backup */}
        <div
          className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-border"
          data-testid="auto-backup"
        >
          <div className="min-w-0">
            <p className="text-sm text-text">Back up my garden to crux.garden automatically</p>
            <p className="text-xs text-text-muted mt-0.5">
              A crux is backed up ten minutes after it goes quiet, the whole garden once a day, and
              every crux you share. A published site is not a backup — this is.
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

        {loadError && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <p role="alert" className="text-xs text-error flex-1 min-w-0">
              {loadError}
            </p>
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={busy}>
              Retry
            </Button>
          </div>
        )}

        {/* Garden backup */}
        <SectionLabel as="h3" className="mb-2">
          Garden Backup
        </SectionLabel>

        {gardenStatus && (
          <p className="text-xs text-text-muted mb-3">
            Last pushed: {formatDateTime(gardenStatus.syncedAt)} ({formatBytes(gardenStatus.size)})
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
            disabled={busy || loading || !!loadError || !gardenStatus}
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
        <SectionLabel as="h3" className="mb-2">
          Synced Cruxes
        </SectionLabel>

        {loading ? (
          <div role="status" className="flex items-center gap-2 text-xs text-text-muted">
            <Spinner size={12} /> Loading...
          </div>
        ) : loadError ? null : syncedCruxes.length === 0 ? (
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

        {status && (
          <p role="status" className="text-xs font-mono text-text-muted mt-3">
            {status}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs font-mono text-error mt-3">
            {error}
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
