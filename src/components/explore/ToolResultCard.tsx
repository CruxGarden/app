import { useState } from 'react';
import { Button } from '@/components/ui';
import type { ExploreCrux } from '@/api/public';
import { toolManifest } from '@/services/crux-tools/registry';
import { useInstalledTools } from '@/services/crux-tools/installed';

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
  onInstall: (report: (done: number, total: number) => void) => Promise<void>;
}) {
  const id = typeof crux.meta?.template === 'string' ? crux.meta.template : null;
  const manifest = id ? toolManifest(id) : null;
  const installed = useInstalledTools();
  const already = id ? !!installed[id] : false;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      await onInstall((done, total) => setProgress({ done, total }));
      setNote('Installed');
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const name = manifest?.name ?? crux.title ?? crux.slug;
  const bytes = typeof crux.meta?.publishedBytes === 'number' ? crux.meta.publishedBytes : null;
  const size =
    bytes === null
      ? ''
      : bytes >= 1024 * 1024 * 1024
        ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
        : bytes >= 1024 * 1024
          ? `${Math.round(bytes / 1024 ** 2)} MB`
          : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return (
    <div
      className="rounded-[var(--radius)] border border-border bg-panel p-4 flex flex-col gap-2"
      data-testid={`explore-tool-${id ?? crux.id}`}
    >
      <button type="button" onClick={onOpen} className="text-left cursor-pointer">
        <p className="font-body font-medium text-text truncate">{name}</p>
        <p className="text-xs text-text-muted line-clamp-2">
          {manifest?.toolInfo?.upstream
            ? `${manifest.toolInfo.upstream} · ${manifest.toolInfo.relationship}`
            : (crux.description ?? '')}
        </p>
      </button>
      <p className="text-2xs font-mono text-text-muted">
        by @{crux.author_username}
        {manifest ? ` · ${manifest.kind}` : ''}
      </p>
      <div className="flex items-center gap-2 mt-auto">
        {!manifest ? (
          <span className="text-xs text-text-muted">Not a tool this app knows</span>
        ) : already ? (
          <span className="text-xs text-text-muted" data-testid="tool-installed">
            Installed · Add Crux ▸ {name}
          </span>
        ) : canInstall ? (
          <Button size="sm" onClick={() => void run()} loading={busy}>
            {progress
              ? `Installing ${progress.done}/${progress.total}`
              : size
                ? `Install · ${size}`
                : 'Install'}
          </Button>
        ) : (
          <span className="text-xs text-text-muted">Open Crux Garden to install</span>
        )}
        {note && !already ? <span className="text-xs text-text-muted">{note}</span> : null}
      </div>
    </div>
  );
}
