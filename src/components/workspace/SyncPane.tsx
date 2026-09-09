import { useState, useCallback, useEffect } from 'react';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import { importCrux } from '@/services/crux-io';
import { backupCrux, backupOf } from '@/services/backup';
import { cruxesChangedSince } from '@/services/drift';
import { isAutoBackupOn, autoBackupPause, AUTO_BACKUP_CHANGED } from '@/services/auto-backup';
import * as syncApi from '@/api/sync';
import { formatBytes, formatDateTime } from '@/lib/format';
import * as usageApi from '@/api/usage';
import { usePaneWidth } from '@/hooks/usePaneWidth';
import ConnectAccount from '@/components/auth/ConnectAccount';
import { PaneEmpty, PaneSection, PaneAction, PaneNote, PaneHint } from './pane-ui';
import { confirmDialog } from '@/stores/dialogStore';

function CloudUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}

function CloudDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m8 17 4 4 4-4" />
    </svg>
  );
}

function autoBackupLine(): { text: string; tone: 'muted' | 'error' } | null {
  if (!isAutoBackupOn()) return null;
  const pause = autoBackupPause();
  return pause
    ? { text: `Automatic backup paused — ${pause}`, tone: 'error' }
    : { text: 'Automatic backup is on', tone: 'muted' };
}

export default function SyncPane() {
  const crux = useCruxStore((s) => s.crux);
  const store = useCruxStoreApi();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [lastSynced, setLastSynced] = useState<{ at: string; size: number } | null>(null);
  const [autoNote, setAutoNote] = useState(() => autoBackupLine());
  // Scenario 8: say where the plan stands before a push fails on it
  const [budget, setBudget] = useState<usageApi.BudgetLine | null>(null);
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
  }, [isAuthenticated, lastSynced]);
  useEffect(() => {
    const sync = () => setAutoNote(autoBackupLine());
    window.addEventListener(AUTO_BACKUP_CHANGED, sync);
    return () => window.removeEventListener(AUTO_BACKUP_CHANGED, sync);
  }, []);

  const { ref, isTooNarrow } = usePaneWidth(200);

  // Fetch sync status for this crux on mount
  useEffect(() => {
    if (!crux || !isAuthenticated) return;
    let cancelled = false;
    syncApi
      .listSyncedCruxes()
      .then((list) => {
        if (cancelled) return;
        const entry = list.find((c) => c.cruxId === crux.id);
        if (entry) setLastSynced({ at: entry.updatedAt, size: entry.size });
      })
      .catch(() => {
        /* non-critical */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crux?.id, isAuthenticated]);

  const handlePush = useCallback(async () => {
    if (!crux) return;
    setPushing(true);
    setError('');
    try {
      const record = await backupCrux(store, setProgress);
      setLastSynced({ at: record.at, size: record.size });
      setProgress('Pushed successfully');
    } catch (err) {
      console.error('Crux push failed:', err);
      setError('Push failed');
      setProgress('');
    } finally {
      setPushing(false);
    }
  }, [crux, store]);

  const growthCount = useCruxStore((s) => s.growthCount);
  const handlePull = useCallback(async () => {
    if (!crux) return;
    // Scenario 6: never quietly overwrite work done here since the last push
    const local = backupOf(crux);
    const behind = local ? Math.max(0, growthCount - local.growthCount) : null;
    const editedSince = local
      ? (await cruxesChangedSince([crux], local.at, 1_000)).length > 0
      : true;
    const changedHere = local === null || (behind ?? 0) > 0 || editedSince;
    if (
      !(await confirmDialog({
        title: 'Pull from cloud',
        message: changedHere
          ? local
            ? `This crux changed here after its last push${behind ? ` — ${behind} snapshot${behind === 1 ? '' : 's'}` : ''}. Pull replaces those changes with the cloud copy. Push first if you want to keep them.`
            : 'This machine never pushed this crux, so the cloud copy is not its backup. Pull replaces everything here with it.'
          : 'Pull will replace this crux with the cloud version. Continue?',
        confirmLabel: changedHere ? 'Pull anyway' : 'Pull',
        danger: true,
      }))
    )
      return;
    setPulling(true);
    setError('');
    setProgress('Downloading from cloud...');
    try {
      const blob = await syncApi.pullCrux(crux.id);
      setProgress('Importing crux...');
      await importCrux({
        data: blob,
        mode: 'replace',
        onProgress: (_done, _total) => setProgress('Importing...'),
      });
      setProgress('Pull complete — reloading...');
      // Keep pulling=true so the UI stays in loading state until reload
      setTimeout(() => window.location.reload(), 800);
    } catch (err: unknown) {
      console.error('Crux pull failed:', err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setError('No cloud version found for this crux');
      } else {
        setError('Pull failed');
      }
      setProgress('');
      setPulling(false);
    }
  }, [crux, growthCount]);

  const busy = pushing || pulling;

  return (
    <div ref={ref} className="flex flex-col h-full">
      {isTooNarrow ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">Enlarge pane to view contents</p>
        </div>
      ) : !isAuthenticated ? (
        <PaneEmpty
          icon={<CloudUpIcon />}
          title="Sync is off"
          description="Connect your crux.garden account to back this crux up to the cloud and pull it onto other devices."
        >
          <div className="rounded-[var(--radius-sm)] border border-border bg-surface/50 p-3 text-left">
            <ConnectAccount compact description="Connect your account to enable sync." />
          </div>
        </PaneEmpty>
      ) : !crux ? (
        <PaneEmpty title="No crux loaded" />
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
          {/* Status */}
          <PaneSection
            label="Cloud status"
            aside={lastSynced ? formatBytes(lastSynced.size) : undefined}
            tone={lastSynced ? 'default' : 'dashed'}
          >
            {lastSynced ? (
              <div className="flex items-center gap-1.5 text-xxs font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="text-text">Synced {formatDateTime(lastSynced.at)}</span>
              </div>
            ) : (
              <p className="text-xxs text-text-muted">
                Not synced yet. Push sends this crux and its history to your account.
              </p>
            )}
            {lastSynced &&
              (() => {
                // Scenario 5: the cloud copy is newer than anything this machine pushed
                const local = backupOf(crux);
                const remoteAt = new Date(lastSynced.at).getTime();
                const localAt = local ? new Date(local.at).getTime() : 0;
                return remoteAt - localAt > 5_000 ? (
                  <div data-testid="sync-drift" className="mt-1.5">
                    <PaneNote tone="muted" className="text-left whitespace-normal">
                      {local
                        ? 'The cloud copy is newer than this machine’s last push — pushed from another machine. Pull to get it, or Push to replace it.'
                        : 'This crux has a cloud copy this machine never pushed — from another machine, or before the app kept track. Pull to get it, or Push to replace it.'}
                    </PaneNote>
                  </div>
                ) : null;
              })()}
            {budget && budget.limit > 0 && budget.used / budget.limit >= 0.8 && (
              <div data-testid="sync-budget" className="mt-1.5">
                <PaneNote
                  tone={budget.over ? 'error' : 'muted'}
                  className="text-left whitespace-normal"
                >
                  {budget.over
                    ? `Storage is over your plan (${formatBytes(budget.used)} of ${formatBytes(budget.limit)}) — pushes are refused above twice the limit. Free up space or upgrade in Settings → Plan.`
                    : `Storage is at ${Math.round((budget.used / budget.limit) * 100)}% of your plan.`}
                </PaneNote>
              </div>
            )}
            {autoNote && (
              <div data-testid="sync-auto-note" className="mt-1.5">
                <PaneNote tone={autoNote.tone} className="text-left">
                  {autoNote.text}
                </PaneNote>
              </div>
            )}
          </PaneSection>

          <PaneSection label="Backup">
            <div className="flex flex-wrap gap-1.5 [&>*]:flex-1 [&>*]:min-w-[132px]">
              <PaneAction
                onClick={handlePush}
                disabled={busy}
                busy={pushing && 'Pushing...'}
                icon={<CloudUpIcon />}
              >
                Push to cloud
              </PaneAction>
              <PaneAction
                tone="secondary"
                onClick={handlePull}
                disabled={busy}
                busy={pulling && 'Pulling...'}
                icon={<CloudDownIcon />}
              >
                Pull from cloud
              </PaneAction>
            </div>
            <PaneHint align="left" className="mt-2">
              Push sends this crux, its conversation and its history to your account. Pull replaces
              the local copy with the cloud version.
            </PaneHint>
          </PaneSection>

          {progress && (
            <PaneNote tone={progress.includes('failed') ? 'error' : 'muted'}>{progress}</PaneNote>
          )}
          {error && <PaneNote tone="error">{error}</PaneNote>}
        </div>
      )}
    </div>
  );
}
