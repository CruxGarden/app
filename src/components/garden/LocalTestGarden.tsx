import { useEffect, useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { openLocalTestGarden } from '@/services/local-staging';
import { openExternal } from '@/services/desktop';
import { confirmDialog } from '@/stores/dialogStore';
import type { StagedSite } from '../../../electron/src/local-staging';

/** Test copies remain manageable even after their editable project has been removed. */
export default function LocalTestGarden() {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<StagedSite[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError('');
    setBusy(true);
    void window
      .electronAPI!.staging!.list()
      .then((sites) => {
        if (active) setSites(sites);
      })
      .catch(() => {
        if (active) setError('Could not read your test copies. Try again.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [open, attempt]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch {
      setError('Could not finish that action. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Local test Garden
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Local test Garden"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Saved website copies on this computer. Available while the app is running; separate from
            your live websites on crux.garden.
          </p>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}{' '}
              <button
                onClick={() => setAttempt((value) => value + 1)}
                className="text-accent underline"
              >
                Retry
              </button>
            </p>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await openLocalTestGarden();
              })
            }
          >
            Open visitor view
          </Button>
          {!busy && !error && !sites.length && (
            <p className="text-sm text-text-muted">
              No test copies yet. Open a website’s Share panel and choose Test locally first.
            </p>
          )}
          <ul className="space-y-3 max-h-[50vh] overflow-y-auto">
            {sites.map((site) => (
              <li
                key={site.id}
                className="border border-border rounded-[var(--radius-sm)] p-3 flex items-center gap-3"
              >
                <span className="flex-1 min-w-0 break-words text-text">{site.title}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => openExternal(site.url))}
                >
                  Open test website
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (
                        !(await confirmDialog({
                          title: 'Remove local test copy?',
                          message: `Remove the test copy of “${site.title}”? Your editable project and live website stay unchanged.`,
                          confirmLabel: 'Remove test copy',
                          danger: true,
                        }))
                      )
                        return;
                      await window.electronAPI!.staging!.remove(site.id);
                      setSites((current) => current.filter((item) => item.id !== site.id));
                    })
                  }
                >
                  Remove test copy
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
}
