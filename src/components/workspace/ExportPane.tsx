import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useThemeStore } from '@/stores/themeStore';
import { cruxes } from '@/api';
import { cn } from '@/lib/cn';
import { usePaneWidth } from '@/hooks/usePaneWidth';
import PaneHeader from './PaneHeader';

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
  const messages = useCruxStore((s) => s.messages);
  const summary = useCruxStore((s) => s.summary);
  const gateCount = useCruxStore((s) => s.gateCount);
  const author = useAuthStore((s) => s.author);
  const paneOrder = useUIStore((s) => s.paneOrder);
  const paneVisibility = useUIStore((s) => s.paneVisibility);
  const editor = useUIStore((s) => s.editor);
  const folderOpenState = useUIStore((s) => s.folderOpenState);
  const themeMode = useThemeStore((s) => s.mode);
  const themeTint = useThemeStore((s) => s.tint);

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');

  const handleExport = useCallback(async () => {
    if (!crux) return;

    setExporting(true);
    setProgress('Fetching data...');

    try {
      const zip = new JSZip();

      // Fetch all data fresh from the API in parallel
      const [freshArtifacts, gates, tags] = await Promise.all([
        cruxes.getAttachments(crux.id),
        cruxes.getDimensions(crux.id, 'gate', 'target').catch(() => [] as unknown[]),
        cruxes.getTags(crux.id).catch(() => []),
      ]);

      setProgress('Building archive...');

      // manifest.json
      zip.file(
        'manifest.json',
        JSON.stringify(
          {
            version: '1.1',
            exportedAt: new Date().toISOString(),
            author: author ? { username: author.username, displayName: author.displayName } : null,
          },
          null,
          2,
        ),
      );

      // crux.json — complete snapshot of crux state
      const cruxData = {
        id: crux.id,
        slug: crux.slug,
        title: crux.title,
        description: crux.description,
        type: crux.type,
        status: crux.status,
        visibility: crux.visibility,
        created: crux.created,
        updated: crux.updated,
        summary,
        gateCount,
        settings: crux.meta?.settings ?? null,
        publishedAt: crux.meta?.publishedAt ?? null,
        tags: tags.map((t) => t.label),
        layout: {
          paneOrder,
          paneVisibility,
          editorTabs: {
            tabs: editor.tabs.map((t) => ({
              id: t.id,
              path: t.path,
              viewMode: t.viewMode,
            })),
            activeTabId: editor.activeTabId,
          },
          folderState: folderOpenState,
        },
        theme: {
          mode: themeMode,
          tint: themeTint,
        },
      };
      zip.file('crux.json', JSON.stringify(cruxData, null, 2));

      // messages.json
      zip.file('messages.json', JSON.stringify(messages, null, 2));

      // gates.json
      if (gates.length > 0) {
        zip.file('gates.json', JSON.stringify(gates, null, 2));
      }

      // Download artifact files
      const failed: string[] = [];
      if (freshArtifacts.length > 0) {
        setProgress('Downloading artifacts...');
        for (let i = 0; i < freshArtifacts.length; i++) {
          const artifact = freshArtifacts[i]!;
          const path = (artifact.meta?.path as string) || artifact.filename || `file-${i + 1}`;
          setProgress(`${i + 1}/${freshArtifacts.length}: ${path}`);

          try {
            const blob = await cruxes.downloadAttachment(crux.id, artifact.id);
            zip.file(`artifacts/${path}`, blob);
          } catch (err) {
            console.warn(`Failed to download: ${path}`, err);
            failed.push(path);
          }
        }
      }

      setProgress('Compressing...');
      const blob = await zip.generateAsync({ type: 'blob' });

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      a.download = `${crux.slug || 'crux'}-${ts}.crux`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (failed.length > 0) {
        setProgress(`Done — ${failed.length} file${failed.length > 1 ? 's' : ''} failed to download`);
      } else {
        setProgress('');
      }
    } catch (err) {
      console.error('Export failed:', err);
      setProgress('Export failed');
    } finally {
      setExporting(false);
    }
  }, [crux, messages, summary, gateCount, author, paneOrder, paneVisibility, editor, folderOpenState, themeMode, themeTint]);

  const totalSize = artifacts.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
  const messageCount = messages.length;
  const hasContent = artifacts.length > 0 || messageCount > 0;

  const { ref, isTooNarrow } = usePaneWidth(200);

  return (
    <div ref={ref} className="flex flex-col h-full">
      <PaneHeader paneType="export" icon={<ExportIcon />} label="Export" />

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
              {gateCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-text">gates.json</span>
                  <span>{gateCount} gates</span>
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

          {/* Export button — state-aware */}
          {exporting ? (
            <button
              disabled
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                'text-sm font-medium font-body',
                'bg-accent-muted text-accent border border-accent/20 cursor-wait',
              )}
            >
              <span className="inline-block w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
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
              Export .crux
            </button>
          )}

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
