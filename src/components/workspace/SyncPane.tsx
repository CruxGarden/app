import { useAiEnabled } from '@/hooks/useAiEnabled';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import { pullCrux, useSyncPull, IDLE_PULL } from '@/services/sync-pull';
import { backupCrux, backupOf, contentRevision } from '@/services/backup';
import { cruxesChangedSince } from '@/services/drift';
import { isAutoBackupOn, autoBackupPause, AUTO_BACKUP_CHANGED } from '@/services/auto-backup';
import * as syncApi from '@/api/sync';
import { assertAuthCurrent, captureAuth } from '@/api/session';
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
  const aiEnabled = useAiEnabled();
  const crux = useCruxStore((s) => s.crux);
  const store = useCruxStoreApi();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accountId = useAuthStore((s) => s.account?.id);
  const { endpoint, revision } = captureAuth();
  const context = useMemo(() => ({ endpoint, revision }), [endpoint, revision]);
  const owner = `${endpoint}:${revision}:${accountId}:${crux?.id}`;

  const [pushing, setPushing] = useState(false);
  const pull = useSyncPull((s) => (crux ? s[crux.id] : undefined) ?? IDLE_PULL);
  const pulling = pull.busy;
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [checkingPull, setCheckingPull] = useState(false);
  const pullPreparation = useRef(false);
  const activeLoad = useRef<object | undefined>(undefined);
  const [remote, setRemote] = useState<{
    owner: string;
    loading: boolean;
    error: string;
    lastSynced: { at: string; size: number } | null;
    budget: usageApi.BudgetLine | null;
  } | null>(null);
  // Never render an earlier connection's inventory, even before effects run.
  const currentRemote = remote?.owner === owner ? remote : null;
  const lastSynced = currentRemote?.lastSynced ?? null;
  const budget = currentRemote?.budget ?? null;
  const loading = currentRemote?.loading ?? true;
  const loadError = currentRemote?.error ?? '';
  const [autoNote, setAutoNote] = useState(() => autoBackupLine());
  const cruxId = crux?.id;
  const refresh = useCallback(async () => {
    if (!cruxId || !isAuthenticated) return;
    const request = {};
    activeLoad.current = request;
    const canApply = () => {
      if (request !== activeLoad.current) return false;
      try {
        assertAuthCurrent(context);
        return useAuthStore.getState().account?.id === accountId;
      } catch {
        return false;
      }
    };
    setRemote({ owner, loading: true, error: '', lastSynced: null, budget: null });
    const [listing, usage] = await Promise.allSettled([
      syncApi.listSyncedCruxes(context),
      usageApi.me(),
    ]);
    if (!canApply()) return;
    const entry =
      listing.status === 'fulfilled' ? listing.value.find((c) => c.cruxId === cruxId) : null;
    setRemote({
      owner,
      loading: false,
      error:
        listing.status === 'rejected'
          ? 'Could not load cloud backup. Check your connection and try again.'
          : '',
      lastSynced: entry ? { at: entry.updatedAt, size: entry.size } : null,
      budget: usage.status === 'fulfilled' ? usage.value.budgets.storage : null,
    });
  }, [cruxId, isAuthenticated, context, accountId, owner]);
  useEffect(() => {
    void refresh();
    return () => {
      activeLoad.current = undefined;
    };
  }, [refresh]);
  useEffect(() => {
    const sync = () => setAutoNote(autoBackupLine());
    window.addEventListener(AUTO_BACKUP_CHANGED, sync);
    return () => window.removeEventListener(AUTO_BACKUP_CHANGED, sync);
  }, []);

  const { ref, isTooNarrow } = usePaneWidth(200);

  const handlePush = useCallback(async () => {
    if (!crux) return;
    useSyncPull.setState({ [crux.id]: IDLE_PULL });
    setPushing(true);
    setError('');
    try {
      await backupCrux(store, setProgress, context);
      assertAuthCurrent(context);
      await refresh();
      setProgress('Pushed successfully');
    } catch (err) {
      console.error('Crux push failed:', err);
      setError(err instanceof Error ? err.message : 'Push failed');
      setProgress('');
    } finally {
      setPushing(false);
    }
  }, [crux, store, context, refresh]);

  const growthCount = useCruxStore((s) => s.growthCount);
  const handlePull = useCallback(async () => {
    if (!crux || pullPreparation.current) return;
    const authContext = captureAuth();
    pullPreparation.current = true;
    setCheckingPull(true);
    setError('');
    try {
      // Scenario 6: never quietly overwrite work done here since the last push
      const local = backupOf(crux);
      const behind = local ? Math.max(0, growthCount - local.growthCount) : null;
      // Desktop keeps file edits in Edit history, not on the Crux row: the
      // revision the push saw against the revision now.
      const revisionNow = await contentRevision(crux.id);
      const editedSince = local
        ? (await cruxesChangedSince([crux], local.at, 1_000)).length > 0 ||
          (revisionNow !== undefined && revisionNow > (local.contentRevision ?? 0))
        : true;
      const changedHere = local === null || (behind ?? 0) > 0 || editedSince;
      assertAuthCurrent(authContext);
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
      assertAuthCurrent(authContext);
      setError('');
      setProgress('');
      await pullCrux(crux.id, authContext);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Pull failed');
    } finally {
      pullPreparation.current = false;
      setCheckingPull(false);
    }
  }, [crux, growthCount]);

  const busy = pushing || pulling || checkingPull;

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
          <div className="rounded-[var(--radius-sm)] border border-border bg-surface/(--tint-balanced) p-3 text-left">
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
            {loading ? (
              <PaneNote>Loading cloud backup…</PaneNote>
            ) : loadError ? (
              <div role="alert" className="flex flex-col gap-2">
                <PaneNote tone="error" className="whitespace-normal">
                  {loadError}
                </PaneNote>
                <PaneAction onClick={refresh} disabled={busy}>
                  Retry
                </PaneAction>
              </div>
            ) : lastSynced ? (
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
                disabled={busy || loading || !!loadError || !lastSynced}
                busy={pulling && 'Pulling...'}
                icon={<CloudDownIcon />}
              >
                Pull from cloud
              </PaneAction>
            </div>
            <PaneHint align="left" className="mt-2">
              Push sends this crux{aiEnabled ? ', its conversation' : ''} and its history to your
              account. Pull replaces the local copy with the cloud version.
            </PaneHint>
          </PaneSection>

          {pull.message && <PaneNote>{pull.message}</PaneNote>}
          {pull.error && <PaneNote tone="error">{pull.error}</PaneNote>}
          {progress && (
            <PaneNote tone={progress.includes('failed') ? 'error' : 'muted'}>{progress}</PaneNote>
          )}
          {error && <PaneNote tone="error">{error}</PaneNote>}
        </div>
      )}
    </div>
  );
}
