import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/ui';
import { Capability, can } from '@/lib/platform';
import type { UpdateState } from '@/lib/platform';
import { updates } from '@/services/desktop';
import { dismissUpdateNotice, dismissedUpdateNotices, updateNotice } from '@/lib/update-notice';

/**
 * An update, said once in the top bar (EF10): "Restart to update" when one
 * has been downloaded; more quietly, "Download" when one is available. It
 * follows the updater's own state — nothing appears unless that state says
 * so — and "Later" puts it away for that version until the next launch.
 */
export default function UpdateNotice() {
  const enabled = can(Capability.Updates);
  const [state, setState] = useState<UpdateState | null>(null);
  const [dismissed, setDismissed] = useState(() => dismissedUpdateNotices());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void updates.state().then((s) => current && setState((now) => now ?? s));
    const off = updates.onChange(setState);
    return () => {
      current = false;
      off();
    };
  }, [enabled]);

  const notice = updateNotice(state, dismissed);
  if (!notice) return null;
  const ready = notice.kind === 'ready';
  const act = async () => {
    setBusy(true);
    try {
      const next = ready ? await updates.install() : await updates.download();
      if (next) setState(next);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      role="status"
      data-testid="update-notice"
      data-kind={notice.kind}
      className="flex items-center gap-1.5 text-xs text-toolbar-text-muted"
    >
      <span className={ready ? 'text-toolbar-text' : undefined}>
        {ready ? `Version ${notice.version} is ready` : `Version ${notice.version} is available`}
      </span>
      <button
        type="button"
        disabled={busy}
        className={buttonClass(ready ? 'primary' : 'ghost', 'xs')}
        onClick={() => void act()}
      >
        {ready ? 'Restart to update' : 'Download'}
      </button>
      <button
        type="button"
        className={buttonClass('ghost', 'xs')}
        onClick={() => setDismissed(dismissUpdateNotice(notice.key))}
      >
        Later
      </button>
    </div>
  );
}
