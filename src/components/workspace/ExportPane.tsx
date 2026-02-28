import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { useCruxStore } from '@/stores/cruxStore';
import { useAuthStore } from '@/stores/authStore';
import { cruxes } from '@/api';
import { cn } from '@/lib/cn';
import { usePaneWidth } from '@/hooks/usePaneWidth';
import PaneHeader from './PaneHeader';

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');

  const handleExport = useCallback(async () => {
    if (!crux) return;

    setExporting(true);
    setProgress('Fetching history...');

    try {
      const zip = new JSZip();

      // Fetch gate dimensions
      let gates: unknown[] = [];
      try {
        gates = await cruxes.getDimensions(crux.id, 'gate', 'target');
      } catch {
        // Gates may not exist
      }

      // manifest.json
      zip.file('manifest.json', JSON.stringify({
        version: '1.0',
        exportedAt: new Date().toISOString(),
        author: author ? { username: author.username, displayName: author.displayName } : null,
      }, null, 2));

      // crux.json — entity + settings (exclude messages to avoid duplication)
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
        settings: crux.meta?.settings,
      };
      zip.file('crux.json', JSON.stringify(cruxData, null, 2));

      // messages.json
      zip.file('messages.json', JSON.stringify(messages, null, 2));

      // gates.json
      if (gates.length > 0) {
        zip.file('gates.json', JSON.stringify(gates, null, 2));
      }

      // Download artifact files
      if (artifacts.length > 0) {
        setProgress('Downloading files...');
        let i = 0;
        for (const artifact of artifacts) {
          i++;
          const path = (artifact.meta?.path as string) || artifact.filename || `file-${i}`;
          setProgress(`${i}/${artifacts.length}: ${path}`);

          try {
            const blob = await cruxes.downloadAttachment(crux.id, artifact.id);
            zip.file(`artifacts/${path}`, blob);
          } catch {
            console.warn(`Failed to download: ${path}`);
          }
        }
      }

      setProgress('Compressing...');
      const blob = await zip.generateAsync({ type: 'blob' });

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${crux.slug || 'crux'}.crux`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress('');
    } catch (err) {
      console.error('Export failed:', err);
      setProgress('Export failed');
    } finally {
      setExporting(false);
    }
  }, [crux, artifacts, messages, summary, gateCount, author]);

  const totalSize = artifacts.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
  const messageCount = messages.length;

  const { ref, isTooNarrow } = usePaneWidth(200);

  return (
    <div ref={ref} className="flex flex-col h-full">
      <PaneHeader paneType="export" icon={<ExportIcon />} label="Export" />

      {isTooNarrow ? (
        <div className="text-text-muted p-4">
          <p className="text-xs text-center">Enlarge pane to view contents</p>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-4">
        {!crux ? (
          <div className="text-text-muted p-1">
            <p className="text-xs text-center">No crux loaded</p>
          </div>
        ) : artifacts.length === 0 && messageCount === 0 ? (
          <div className="text-text-muted p-1">
            <p className="text-xs text-center">Nothing to export yet</p>
          </div>
        ) : (
          <>
            {/* Contents summary */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Contents</span>
              <div className="text-[11px] font-mono text-text-muted space-y-1">
                <div className="flex justify-between">
                  <span>Files</span>
                  <span className="text-text">{artifacts.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Messages</span>
                  <span className="text-text">{messageCount}</span>
                </div>
                {gateCount > 0 && (
                  <div className="flex justify-between">
                    <span>Gates</span>
                    <span className="text-text">{gateCount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Total file size</span>
                  <span className="text-text">{formatBytes(totalSize)}</span>
                </div>
              </div>
            </div>

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={exporting}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                'text-sm font-medium font-body transition-all cursor-pointer',
                'bg-accent text-bg hover:brightness-110',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <ExportIcon />
              {exporting ? 'Exporting...' : 'Export Crux'}
            </button>

            {/* Progress */}
            {progress && (
              <p className="text-[11px] font-mono text-text-muted text-center truncate">
                {progress}
              </p>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
