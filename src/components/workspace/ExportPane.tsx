import { useState, useCallback, useMemo } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useAppStore } from '@/stores/appStore';
import { exportCrux, exportArtifactsZip } from '@/services/crux-io';
import { formatBytes } from '@/lib/format';
import { usePaneWidth } from '@/hooks/usePaneWidth';
import { PaneEmpty, PaneSection, PaneAction, PaneHint, PaneNote } from './pane-ui';
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

export default function ExportPane() {
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const allMessages = useCruxStore((s) => s.messages);
  const messageSegmentStart = useCruxStore((s) => s.messageSegmentStart);
  const messages = useMemo(
    () => allMessages.slice(messageSegmentStart),
    [allMessages, messageSegmentStart],
  );
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
        setProgress(
          `Done — ${result.failed.length} file${result.failed.length > 1 ? 's' : ''} failed`,
        );
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
        setProgress(
          `Done — ${result.failed.length} file${result.failed.length > 1 ? 's' : ''} failed`,
        );
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
        <PaneEmpty title="No crux loaded" />
      ) : !hasContent ? (
        <PaneEmpty
          icon={<ExportIcon />}
          title="Nothing to export yet"
          description="Once this crux has files or a conversation, you can download it as an archive."
        />
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
          <PaneSection label="Archive" aside={formatBytes(totalSize)}>
            <ul className="text-xxs font-mono text-text-muted flex flex-col gap-0.5">
              <li className="flex justify-between gap-2">
                <span className="text-text">conversation</span>
                <span>
                  {messageCount} message{messageCount === 1 ? '' : 's'}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-text">history</span>
                <span>
                  {growthCount} snapshot{growthCount === 1 ? '' : 's'}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-text">files</span>
                <span>
                  {artifacts.length} artifact{artifacts.length === 1 ? '' : 's'}
                </span>
              </li>
              {artifacts.slice(0, 6).map((a, i) => {
                const path = (a.meta?.path as string) || a.filename || `file-${i + 1}`;
                return (
                  <li key={a.id} className="flex justify-between gap-2 pl-3">
                    <span className="truncate">{path}</span>
                    <span className="shrink-0">{formatBytes(Number(a.size) || 0)}</span>
                  </li>
                );
              })}
              {artifacts.length > 6 && <li className="pl-3">+ {artifacts.length - 6} more</li>}
            </ul>
          </PaneSection>

          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <PaneAction
                onClick={handleExport}
                busy={exporting && 'Exporting...'}
                icon={<ExportIcon />}
              >
                Export Crux
              </PaneAction>
              {artifacts.length > 0 && (
                <PaneAction
                  tone="secondary"
                  onClick={handleExportZip}
                  disabled={exporting}
                  busy={exportingZip && 'Exporting...'}
                  icon={<ZipIcon />}
                >
                  Export Artifacts
                </PaneAction>
              )}
            </div>
            <PaneHint align="left">
              The .crux archive carries the files, the conversation and every snapshot; Export
              Artifacts is a plain zip of the files.
            </PaneHint>
          </div>

          {progress && (
            <PaneNote tone={progress === 'Export failed' ? 'error' : 'muted'}>{progress}</PaneNote>
          )}
        </div>
      )}
    </div>
  );
}
