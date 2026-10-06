import ExploreCreator from './ExploreCreator';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import type { ExploreCrux, DownloadProgress } from '@/api/public';
import { toolManifest } from '@/services/crux-tools/registry';
import { useInstalledTools, publishedToolId } from '@/services/crux-tools/installed';
import { toolUpdateAvailable } from '@/services/update-notices';
import { deepLinkUrl } from '@/services/deep-links';
import { buttonClass } from '@/components/ui/button-class';
import ToolTrustDetails from './ToolTrustDetails';
import { formatToolSize, toolSummaryOf } from './tool-trust';

/**
 * A published Crux Tool in Explore (CRUX-TOOLS-DISTRIBUTION-PLAN §3.4): the
 * tool's name and provenance, and one button — Install — which clones the
 * Template Crux into this garden. Installed, it says so and points at Add Crux.
 */
export default function ToolResultCard({
  crux,
  canInstall,
  onOpen,
  onInstall,
}: {
  crux: ExploreCrux;
  canInstall: boolean;
  onOpen: () => void;
  onInstall: (options: {
    signal: AbortSignal;
    onDownloadProgress: (progress: DownloadProgress) => void;
  }) => Promise<void>;
}) {
  const id = typeof crux.meta?.template === 'string' ? crux.meta.template : null;
  const manifest = id ? toolManifest(id) : null;
  const installed = useInstalledTools();
  const current = installed[publishedToolId(crux.id)];
  const packageRef = crux.meta?.toolPackage as { fingerprint?: string } | undefined;
  const updateAvailable = toolUpdateAvailable(current, packageRef?.fingerprint);
  const summary = toolSummaryOf(crux as ExploreCrux & { toolSummary?: unknown });
  const already = !!current && !updateAvailable;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const [note, setNote] = useState<string | null>(null);
  const run = async () => {
    if (controller.current) return;
    const pending = new AbortController();
    controller.current = pending;
    setBusy(true);
    setNote(null);
    try {
      await onInstall({ signal: pending.signal, onDownloadProgress: setProgress });
      setNote('Installed');
    } catch (err) {
      setNote(
        pending.signal.aborted
          ? 'Cancelled. You can retry; existing tools are unchanged.'
          : err instanceof Error
            ? err.message
            : 'Download failed. Try again.',
      );
    } finally {
      controller.current = null;
      setBusy(false);
      setProgress(null);
    }
  };
  const name = crux.title ?? manifest?.name ?? crux.slug;
  const bytes =
    summary?.sizeBytes ??
    (typeof crux.meta?.publishedBytes === 'number' ? crux.meta.publishedBytes : null);
  const size = formatToolSize(bytes);
  return (
    <div
      className="rounded-[var(--radius)] border border-border bg-panel p-4 flex flex-col gap-2 transition-[border-color,box-shadow] hover:border-action-button-border-hover hover:shadow-card-hover motion-enter-card"
      data-testid={`explore-tool-${id ?? crux.id}`}
    >
      <button type="button" onClick={onOpen} className="group/open text-left cursor-pointer">
        <p className="font-body font-medium text-text group-hover/open:text-accent transition-colors truncate">
          {name}
        </p>
        <p className="text-xs text-text-muted line-clamp-2">
          {manifest?.toolInfo?.upstream
            ? `${manifest.toolInfo.upstream} · ${manifest.toolInfo.relationship}`
            : (crux.description ?? '')}
        </p>
      </button>
      <ExploreCreator crux={crux} />
      {summary && <ToolTrustDetails summary={summary} compact />}
      <div className="flex items-center gap-2 mt-auto">
        {already ? (
          <span className="text-xs text-text-muted" data-testid="tool-installed">
            Installed · Add Crux ▸ {name}
          </span>
        ) : canInstall ? (
          <Button size="sm" onClick={() => void run()} loading={busy}>
            {progress
              ? progress.total && progress.received >= progress.total
                ? 'Checking package…'
                : 'Downloading…'
              : updateAvailable
                ? 'Install update'
                : size
                  ? `Install · ${size}`
                  : 'Install'}
          </Button>
        ) : (
          <a
            href={deepLinkUrl({ kind: 'install', type: 'tool', cruxId: crux.id })}
            className={buttonClass('secondary', 'sm')}
            data-testid="open-in-crux-garden"
          >
            Open in Crux Garden
          </a>
        )}
        {busy && (
          <Button size="sm" variant="ghost" onClick={() => controller.current?.abort()}>
            Cancel
          </Button>
        )}
        {note && !already ? <span className="text-xs text-text-muted">{note}</span> : null}
      </div>
      {busy && progress && (
        <div className="text-xs text-text-muted space-y-1" role="status">
          <p>
            {(progress.received / 1024 ** 2).toFixed(1)} MB
            {progress.total ? ` of ${(progress.total / 1024 ** 2).toFixed(1)} MB` : ' downloaded'}
          </p>
          <progress
            aria-label={`Downloading ${name}`}
            className="w-full accent-accent"
            max={progress.total ?? 1}
            value={progress.total ? progress.received : undefined}
          />
        </div>
      )}
    </div>
  );
}
