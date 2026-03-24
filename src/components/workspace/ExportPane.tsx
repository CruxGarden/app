import { useState, useCallback, useMemo } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useAppStore } from '@/stores/appStore';
import { exportCrux, exportArtifactsZip } from '@/services/crux-io';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui';
import { usePaneWidth } from '@/hooks/usePaneWidth';
function ExportIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ZipIcon() {
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <polyline points="9 14 12 17 15 14" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function ExportPane() {
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const allMessages = useCruxStore((s) => s.messages);
  const messageSegmentStart = useCruxStore((s) => s.messageSegmentStart);
  const messages = useMemo(() => allMessages.slice(messageSegmentStart), [allMessages, messageSegmentStart]);
  const summary = useCruxStore((s) => s.summary);
  const growthCount = useCruxStore((s) => s.growthCount);
  const author = useAppStore((s) => s.author);

  const [exporting, setExporting] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [progress, setProgress] = useState('');

  const handleExport = useCallback(async () => {
    if (!crux) return;

    setExporting(true);
    setProgress('Fetching data...');

    try {
      const result = await exportCrux({
        cruxId: crux.id,
        messages,
        summary,
        author: author ? { username: author.username, displayName: author.displayName } : null,
        onProgress: setProgress,
      });

      // Trigger download
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (result.failed.length > 0) {
        setProgress(`Done — ${result.failed.length} file${result.failed.length > 1 ? 's' : ''} failed`);
      } else {
        setProgress('');
      }
    } catch (err) {
      console.error('Export failed:', err);
      setProgress('Export failed');
    } finally {
      setExporting(false);
    }
  }, [crux, messages, summary, author]);

  const handleExportZip = useCallback(async () => {
    if (!crux || artifacts.length === 0) return;

    setExportingZip(true);
    setProgress('Packing artifacts...');

    try {
      const result = await exportArtifactsZip({
        cruxSlug: crux.slug,
        artifacts,
        onProgress: setProgress,
      });

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (result.failed.length > 0) {
        setProgress(`Done — ${result.failed.length} file${result.failed.length > 1 ? 's' : ''} failed`);
      } else {
        setProgress('');
      }
    } catch (err) {
      console.error('ZIP export failed:', err);
      setProgress('Export failed');
    } finally {
      setExportingZip(false);
    }
  }, [crux, artifacts]);

  const totalSize = artifacts.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
  const messageCount = messages.length;
  const hasContent = artifacts.length > 0 || messageCount > 0;

  const { ref, isTooNarrow } = usePaneWidth(200);

  return (
    <div ref={ref} className="flex flex-col h-full">
      {isTooNarrow ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">Enlarge pane to view contents</p>
        </div>
      ) : !crux ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">No crux loaded</p>
        </div>
      ) : !hasContent ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">Nothing to export yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
          {/* Archive contents (collapsible) */}
          <details className="rounded-[var(--radius-sm)] border border-border bg-surface/50 group">
            <summary className="px-3 py-2 flex items-center justify-between cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Archive contents
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-text-muted transition-transform group-open:rotate-180"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </summary>
            <div className="px-3 pb-3 text-[11px] font-mono text-text-muted space-y-0.5">
              <div className="text-text">manifest.json</div>
              <div className="text-text">crux.json</div>
              <div className="flex justify-between">
                <span className="text-text">messages.json</span>
                <span>{messageCount} msgs</span>
              </div>
              {growthCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-text">versions/</span>
                  <span>{growthCount} snapshots</span>
                </div>
              )}
              {artifacts.length > 0 && (
                <>
                  <div className="pt-1 mt-1 border-t border-border/50">
                    <span className="text-text-muted">artifacts/</span>
                  </div>
                  {artifacts.map((a, i) => {
                    const path = (a.meta?.path as string) || a.filename || `file-${i + 1}`;
                    return (
                      <div key={a.id} className="flex justify-between pl-3">
                        <span className="text-text truncate mr-2">{path}</span>
                        <span className="shrink-0">{formatBytes(Number(a.size) || 0)}</span>
                      </div>
                    );
                  })}
                </>
              )}
              <div className="flex justify-between pt-1 mt-1 border-t border-border">
                <span>Total</span>
                <span className="text-text">{formatBytes(totalSize)}</span>
              </div>
            </div>
          </details>

          {/* Export buttons */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              {exporting ? (
                <button
                  disabled
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                    'text-sm font-medium font-body',
                    'bg-accent-muted text-accent border border-accent/20 cursor-wait',
                  )}
                >
                  <Spinner size={14} />
                  Exporting...
                </button>
              ) : (
                <button
                  onClick={handleExport}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                    'text-sm font-medium font-body transition-all cursor-pointer',
                    'bg-accent-muted text-accent border border-accent/20 hover:border-accent',
                  )}
                >
                  <ExportIcon />
                  Export Crux
                </button>
              )}
              <p className="text-[10px] text-text-muted text-center">
                Full archive — artifacts, conversation, and version history
              </p>
            </div>

            {artifacts.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {exportingZip ? (
                  <button
                    disabled
                    className={cn(
                      'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                      'text-sm font-medium font-body',
                      'bg-surface text-text-muted border border-border cursor-wait',
                    )}
                  >
                    <Spinner size={14} />
                    Exporting...
                  </button>
                ) : (
                  <button
                    onClick={handleExportZip}
                    disabled={exporting}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                      'text-sm font-medium font-body transition-all cursor-pointer',
                      'bg-surface text-text-muted border border-border hover:border-text-muted hover:text-text',
                      exporting && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <ZipIcon />
                    Export Artifacts
                  </button>
                )}
                <p className="text-[10px] text-text-muted text-center">
                  Just the files — ready to unzip and use
                </p>
              </div>
            )}
          </div>

          {/* Progress */}
          {progress && (
            <p className={cn(
              'text-[11px] font-mono text-center truncate',
              progress === 'Export failed' ? 'text-error' : 'text-text-muted',
            )}>
              {progress}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
