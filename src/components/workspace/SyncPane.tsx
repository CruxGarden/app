import { useState, useCallback, useEffect, useMemo } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { exportCrux, importCrux } from '@/services/crux-io';
import * as syncApi from '@/api/sync';
import { formatBytes, formatDateTime } from '@/lib/format';
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

export default function SyncPane() {
  const crux = useCruxStore((s) => s.crux);
  const allMessages = useCruxStore((s) => s.messages);
  const messageSegmentStart = useCruxStore((s) => s.messageSegmentStart);
  const messages = useMemo(
    () => allMessages.slice(messageSegmentStart),
    [allMessages, messageSegmentStart],
  );
  const summary = useCruxStore((s) => s.summary);
  const author = useAppStore((s) => s.author);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [lastSynced, setLastSynced] = useState<{ at: string; size: number } | null>(null);

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
    setProgress('Exporting crux...');
    try {
      const result = await exportCrux({
        cruxId: crux.id,
        messages,
        summary,
        author: author ? { username: author.username, displayName: author.displayName } : null,
        onProgress: setProgress,
      });

      setProgress('Uploading to cloud...');
      const entry = await syncApi.pushCrux(crux.id, result.blob, {
        slug: crux.slug || crux.id,
        title: crux.title || 'Untitled',
      });

      setLastSynced({ at: entry.updatedAt, size: entry.size });
      setProgress('Pushed successfully');
    } catch (err) {
      console.error('Crux push failed:', err);
      setError('Push failed');
      setProgress('');
    } finally {
      setPushing(false);
    }
  }, [crux, messages, summary, author]);

  const handlePull = useCallback(async () => {
    if (!crux) return;
    if (
      !(await confirmDialog({
        title: 'Pull from cloud',
        message: 'Pull will replace this crux with the cloud version. Continue?',
        confirmLabel: 'Pull',
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
  }, [crux]);

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
              <div className="flex items-center gap-1.5 text-[11px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="text-text">Synced {formatDateTime(lastSynced.at)}</span>
              </div>
            ) : (
              <p className="text-[11px] text-text-muted">
                Not synced yet. Push sends this crux and its history to your account.
              </p>
            )}
          </PaneSection>

          <div className="flex flex-col gap-1.5">
            <PaneAction
              onClick={handlePush}
              disabled={busy}
              busy={pushing && 'Pushing...'}
              icon={<CloudUpIcon />}
            >
              Push to cloud
            </PaneAction>
            <PaneHint>Upload this crux, its conversation, and its history</PaneHint>
          </div>

          <div className="flex flex-col gap-1.5">
            <PaneAction
              tone="secondary"
              onClick={handlePull}
              disabled={busy}
              busy={pulling && 'Pulling...'}
              icon={<CloudDownIcon />}
            >
              Pull from cloud
            </PaneAction>
            <PaneHint>Replace the local copy with the cloud version</PaneHint>
          </div>

          {progress && (
            <PaneNote tone={progress.includes('failed') ? 'error' : 'muted'}>{progress}</PaneNote>
          )}
          {error && <PaneNote tone="error">{error}</PaneNote>}
        </div>
      )}
    </div>
  );
}
