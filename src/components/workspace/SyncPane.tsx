import { useState, useCallback, useEffect, useMemo } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import { exportCrux, importCrux } from '@/services/crux-io';
import * as syncApi from '@/api/sync';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui';
import { usePaneWidth } from '@/hooks/usePaneWidth';

function CloudUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m16 16-4-4-4 4" />
    </svg>
  );
}

function CloudDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" />
      <path d="m8 17 4 4 4-4" />
    </svg>
  );
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function SyncPane() {
  const crux = useCruxStore((s) => s.crux);
  const allMessages = useCruxStore((s) => s.messages);
  const messageSegmentStart = useCruxStore((s) => s.messageSegmentStart);
  const messages = useMemo(() => allMessages.slice(messageSegmentStart), [allMessages, messageSegmentStart]);
  const summary = useCruxStore((s) => s.summary);
  const author = useAuthStore((s) => s.author);
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
    syncApi.listSyncedCruxes().then((list) => {
      if (cancelled) return;
      const entry = list.find((c) => c.cruxId === crux.id);
      if (entry) setLastSynced({ at: entry.updatedAt, size: entry.size });
    }).catch(() => { /* non-critical */ });
    return () => { cancelled = true; };
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
    if (!confirm('Pull will replace this crux with the cloud version. Continue?')) return;

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
      const status = (err as any)?.response?.status;
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
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted text-center">
            Connect your account in Settings to enable cloud sync
          </p>
        </div>
      ) : !crux ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">No crux loaded</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
          {/* Status */}
          <div className="rounded-[var(--radius-sm)] border border-border bg-surface/50 px-3 py-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
              Cloud status
            </div>
            {lastSynced ? (
              <div className="text-[11px] font-mono text-text-muted">
                <span className="text-text">{formatDate(lastSynced.at)}</span>
                <span className="ml-2">{formatSize(lastSynced.size)}</span>
              </div>
            ) : (
              <div className="text-[11px] font-mono text-text-muted">
                Not synced yet
              </div>
            )}
          </div>

          {/* Push */}
          <button
            onClick={handlePush}
            disabled={busy}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
              'text-sm font-medium font-body transition-all',
              busy
                ? 'bg-accent-muted text-accent border border-accent/20 cursor-wait'
                : 'bg-accent-muted text-accent border border-accent/20 hover:border-accent cursor-pointer',
            )}
          >
            {pushing ? (
              <><Spinner size={14} /> Pushing...</>
            ) : (
              <><CloudUpIcon /> Push to cloud</>
            )}
          </button>

          {/* Pull */}
          <button
            onClick={handlePull}
            disabled={busy}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
              'text-sm font-medium font-body transition-all',
              busy
                ? 'bg-surface text-text-muted border border-border cursor-wait'
                : 'bg-surface text-text border border-border hover:border-accent cursor-pointer',
            )}
          >
            {pulling ? (
              <><Spinner size={14} /> Pulling...</>
            ) : (
              <><CloudDownIcon /> Pull from cloud</>
            )}
          </button>

          {/* Progress / error */}
          {progress && (
            <p className={cn(
              'text-[11px] font-mono text-center truncate',
              progress.includes('failed') ? 'text-error' : 'text-text-muted',
            )}>
              {progress}
            </p>
          )}
          {error && (
            <p className="text-[11px] font-mono text-center text-error">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
