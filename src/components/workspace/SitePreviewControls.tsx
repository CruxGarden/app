import { useEffect, useState } from 'react';
import type { SitePreview } from '@/hooks/useSitePreview';

/**
 * The dev-server controls in the preview's URL bar (Site Cruxes only): a
 * status dot, the port (editable — Enter restarts on it, empty clears the
 * preference), Refresh (reload the frame) and Restart (`astro dev` again).
 * Everything here is also reachable without the model, per the parity rule.
 */
export default function SitePreviewControls({
  site,
  onRefresh,
}: {
  site: SitePreview;
  onRefresh: () => void;
}) {
  const [portText, setPortText] = useState(site.port ? String(site.port) : '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (site.port) setPortText(String(site.port));
  }, [site.port]);

  const running = site.phase === 'ready';
  const dot =
    site.phase === 'ready'
      ? 'bg-success'
      : site.phase === 'error'
        ? 'bg-error'
        : 'bg-text-muted animate-pulse';
  const label =
    site.phase === 'ready'
      ? 'Dev server running'
      : site.phase === 'error'
        ? 'Dev server failed'
        : site.phase === 'installing'
          ? 'Installing…'
          : 'Starting…';

  const restart = async (port?: number | null) => {
    setBusy(true);
    try {
      await site.restart(port);
    } finally {
      setBusy(false);
    }
  };

  const commitPort = () => {
    const trimmed = portText.trim();
    if (trimmed === '') {
      if (site.preferredPort) void restart(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) {
      setPortText(site.port ? String(site.port) : '');
      return;
    }
    if (n !== site.port || n !== site.preferredPort) void restart(n);
  };

  const btn =
    'shrink-0 px-1.5 py-0.5 rounded-[var(--radius-sm)] hover:text-text hover:bg-surface-solid transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';

  return (
    <>
      <span
        className={`shrink-0 w-1.5 h-1.5 rounded-full ${dot}`}
        title={label}
        data-testid="dev-server-status"
        data-phase={site.phase}
      />
      <label
        className="shrink-0 flex items-center gap-1"
        title="Dev server port — Enter to restart on it; empty to let it choose"
      >
        <span>port</span>
        <input
          value={portText}
          onChange={(e) => setPortText(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitPort();
            if (e.key === 'Escape') setPortText(site.port ? String(site.port) : '');
          }}
          onBlur={commitPort}
          inputMode="numeric"
          placeholder="auto"
          className="w-14 bg-transparent border border-border rounded-[var(--radius-sm)] px-1 py-0 text-2xs font-mono text-text focus:outline-none focus:border-accent"
          data-testid="dev-server-port"
          disabled={busy}
        />
        {site.preferredPort && site.port && site.preferredPort !== site.port && (
          <span className="text-warning" title={`Port ${site.preferredPort} was in use`}>
            (wanted {site.preferredPort})
          </span>
        )}
      </label>
      <button
        onClick={onRefresh}
        className={btn}
        title="Reload the preview"
        disabled={!running}
        data-testid="preview-refresh"
      >
        Refresh
      </button>
      <button
        onClick={() => void restart()}
        className={btn}
        title="Stop and start the dev server again"
        disabled={busy}
        data-testid="dev-server-restart"
      >
        {busy ? 'Restarting…' : 'Restart'}
      </button>
    </>
  );
}
