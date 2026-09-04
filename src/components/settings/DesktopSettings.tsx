import { useEffect, useState } from 'react';
import { Panel, Button, Toggle } from '@/components/ui';
import { Capability, can } from '@/lib/platform';
import type { DesktopInfo, UpdateState } from '@/lib/platform';
import { getDesktopInfo, openLogs, updates, shortenHomePath } from '@/services/desktop';

/**
 * Settings → Desktop: what build this is, updates (visible and disableable,
 * ADR 0007/0008), and where the local logs live. Desktop only.
 */
export default function DesktopSettings() {
  const desktop = can(Capability.Updates);
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [state, setState] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    getDesktopInfo().then(setInfo);
    updates.state().then(setState);
    return updates.onChange(setState);
  }, [desktop]);

  if (!desktop) return null;

  const run = async (fn: () => Promise<UpdateState | null | void>) => {
    setBusy(true);
    try {
      const s = await fn();
      if (s) setState(s);
    } finally {
      setBusy(false);
    }
  };

  const statusText = (() => {
    if (!state) return '';
    switch (state.status) {
      case 'disabled':
        return 'Updates apply to installed builds only.';
      case 'idle':
        return state.lastCheckedAt ? '' : 'Not checked yet.';
      case 'checking':
        return 'Checking…';
      case 'available':
        return `Version ${state.availableVersion} is available.`;
      case 'not-available':
        return 'You have the latest version.';
      case 'downloading':
        return `Downloading… ${state.progress ?? 0}%`;
      case 'downloaded':
        return `Version ${state.availableVersion} is ready to install.`;
      case 'error':
        return `Update check failed: ${state.error ?? 'unknown error'}`;
    }
  })();

  return (
    <Panel padding="md" data-testid="desktop-settings">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-display text-sm font-medium text-accent">Desktop</h2>
        {info && (
          <span className="text-xxs font-mono text-text-muted">
            v{info.version} · {info.platform}-{info.arch}
            {info.packaged ? '' : ' · dev'}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-text">Updates</div>
            <div className="text-text-muted" data-testid="update-status">
              {statusText}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {state?.status === 'available' && (
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => run(() => updates.download())}
              >
                Download
              </Button>
            )}
            {state?.status === 'downloaded' && (
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => run(() => updates.install())}
              >
                Restart to update
              </Button>
            )}
            {state && !['downloading', 'downloaded', 'disabled'].includes(state.status) && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy || state.status === 'checking'}
                onClick={() => run(() => updates.check())}
              >
                Check for updates
              </Button>
            )}
          </div>
        </div>
        <Toggle
          label="Check for updates when the app starts"
          checked={state?.autoCheck ?? true}
          disabled={!state || state.status === 'disabled'}
          onChange={(on) => run(() => updates.setAutoCheck(on))}
        />
        <p className="text-2xs text-text-muted">
          The update check is the only routine network call this app makes on its own. Nothing
          downloads without your click.
        </p>

        <div className="border-t border-border my-1" />

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-text">Logs</div>
            <div className="text-text-muted font-mono">
              {info ? shortenHomePath(info.logsDir) : ''}
            </div>
            <div className="text-2xs text-text-muted">
              Written locally, never sent. Attach main.log to a GitHub issue when something breaks.
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void openLogs()}>
            Open logs folder
          </Button>
        </div>
      </div>
    </Panel>
  );
}
