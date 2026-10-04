import { plainError } from '@/lib/error-text';
import { useEffect, useState } from 'react';
import { useCruxStore, useCruxStoreApi } from '@/stores/cruxStore';
import { useWorkspaceUIStoreApi } from '@/stores/uiStore';
import { stageWebsite, openLocalTestGarden, websiteSourceHash } from '@/services/local-staging';
import { openExternal } from '@/services/desktop';
import { functionFiles } from '@/services/crux-functions';
import { buttonClass } from '@/components/ui/button-class';
import { confirmDialog } from '@/stores/dialogStore';
import { formatDateTime } from '@/lib/format';
import type { StagedSite } from '../../../electron/src/local-staging';

export default function LocalTestPublication() {
  const store = useCruxStoreApi();
  const ui = useWorkspaceUIStoreApi();
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const hasFunctions = functionFiles(artifacts).length > 0;
  const id = crux?.id;
  const [site, setSite] = useState<StagedSite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sourceHash, setSourceHash] = useState('');
  useEffect(() => {
    let active = true;
    if (crux)
      void websiteSourceHash(crux, artifacts)
        .then((hash) => {
          if (active) setSourceHash(hash);
        })
        .catch(() => {
          if (active) setSourceHash('');
        });
    return () => {
      active = false;
    };
  }, [crux, artifacts]);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError('');
    setSite(null);
    void window.electronAPI?.staging
      ?.list()
      .then((sites) => {
        if (active) {
          setSite(sites.find((site) => site.id === id) ?? null);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active) setError('Could not read saved test websites. Try again.');
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      const message = plainError(
        error,
        'Local testing failed. Your project and live website are unchanged.',
      );
      setError(
        /ENOSPC|no space left|disk (?:is )?full/i.test(message)
          ? 'Could not save the test copy. Free up space on this computer, then retry. Your project and live website are unchanged.'
          : /EACCES|EPERM|permission denied/i.test(message)
            ? 'Could not change the test copy. Check access to the app’s data folder, then retry. Your project and live website are unchanged.'
            : message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      className="rounded-[var(--radius-sm)] border border-border p-3"
      data-testid="local-test-publication"
    >
      <summary className="cursor-pointer text-sm font-medium">
        Test locally first{' '}
        <span className="text-text-muted">· {hasFunctions ? 'static only' : 'optional'}</span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-text">Local test Garden</p>
        <p className="text-xs text-text-muted leading-relaxed">
          Save a test copy of your website on this computer. It stays unchanged as you edit. No
          account is needed, and your live site on crux.garden stays unchanged.
        </p>
        <p className="text-xs text-text-muted leading-relaxed">
          Available while the app is running, on this computer only. Hosted accounts, Functions and
          form submissions are not available here. External images and fonts may still use the
          internet.
        </p>
        {hasFunctions && (
          <p className="text-xs text-text leading-relaxed">
            <strong>This Crux uses Functions.</strong> This test copy shows static files only. Use
            Workshop to test Functions with your local Store. Test published visitor accounts and
            server data on the online site or in a full API development environment.
          </p>
        )}
        {site && (
          <p role="status" className="text-xs text-text-muted">
            Test copy saved {formatDateTime(site.savedAt)}.{' '}
            {site.sourceHash && sourceHash
              ? site.sourceHash === sourceHash
                ? 'Matches your saved files.'
                : 'You have changes to test.'
              : 'Publish an update to include later edits.'}
            {hasFunctions && (
              <span className="block mt-1">Functions and Store operations were not tested.</span>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}
        {!loaded && error && (
          <button
            className={buttonClass('secondary', 'sm')}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry local test Garden
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass('secondary', 'sm')}
            disabled={busy || !loaded}
            onClick={() =>
              void run(async () => {
                const result = await stageWebsite(store, ui);
                if (store.getState().crux?.id === id) setSite(result);
              })
            }
          >
            {busy
              ? 'Preparing test copy…'
              : hasFunctions
                ? site
                  ? 'Update static-only test copy'
                  : 'Save static-only test copy'
                : site
                  ? 'Update local test copy'
                  : 'Publish to local test Garden'}
          </button>
          {site && (
            <button
              className={buttonClass('secondary', 'sm')}
              disabled={busy}
              onClick={() => void run(() => openExternal(site.url))}
            >
              Open test website
            </button>
          )}
          <button
            className={buttonClass('ghost', 'sm')}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await openLocalTestGarden();
              })
            }
          >
            Open local test Garden
          </button>
          {site && (
            <button
              className={buttonClass('ghost', 'sm')}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (
                    !(await confirmDialog({
                      title: 'Remove local test copy?',
                      message:
                        'Your editable project and live website on crux.garden stay unchanged.',
                      confirmLabel: 'Remove test copy',
                      danger: true,
                    }))
                  )
                    return;
                  await window.electronAPI!.staging!.remove(site.id);
                  if (store.getState().crux?.id === id) setSite(null);
                })
              }
            >
              Remove test copy
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
