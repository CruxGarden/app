import { useEffect, useRef, useState } from 'react';
import type { Crux } from '@/api/types';
import * as cruxesApi from '@/api/cruxes';
import { assertAuthCurrent, captureAuth } from '@/api/session';
import { useAuthStore } from '@/stores/authStore';
import { useCruxStore } from '@/stores/cruxStore';
import { Toggle } from '@/components/ui';
import { linkClass } from '@/components/ui/button-class';
import { PaneSection } from './pane-ui';

/** The saved preference and the confirmed online listing are separate facts. */
export default function PublicationVisibility({ crux }: { crux: Crux }) {
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const account = useAuthStore((s) => s.account);
  const updateCrux = useCruxStore((s) => s.updateCrux);
  const published = crux.meta?.publishedAt != null;
  const preferred = !!crux.discoverable;
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const operation = useRef(0);
  const saving = useRef(false);

  useEffect(() => {
    const generation = ++operation.current;
    let active = true;
    setOnline(null);
    setError('');
    if (!published || !authenticated) return;
    const context = captureAuth();
    void cruxesApi
      .get(crux.id, context)
      .then((result) => {
        if (!active || generation !== operation.current) return;
        if (!result.meta?.publishedAt) {
          setError(
            'This site is no longer shared online. Share it again to apply your preference.',
          );
          return;
        }
        setOnline(!!result.discoverable);
      })
      .catch(() => {
        if (active && generation === operation.current)
          setError('Could not check the online listing. Your saved preference is still here.');
      });
    return () => {
      active = false;
    };
  }, [crux.id, crux.meta?.publishedVersion, published, authenticated, account, refresh]);

  const save = async (on: boolean, persist = true) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    const generation = ++operation.current;
    const context = captureAuth();
    let saved = !persist;
    try {
      if (persist) await updateCrux({ discoverable: on });
      saved = true;
      if (published && authenticated) {
        assertAuthCurrent(context);
        const result = await cruxesApi.update(crux.id, { discoverable: on }, context);
        if (generation === operation.current) setOnline(!!result.discoverable);
      }
    } catch {
      if (generation === operation.current)
        setError(
          saved
            ? 'Your preference is saved here, but the online listing update is not confirmed.'
            : 'Could not save your visibility preference. Try again.',
        );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const differs = online !== null && online !== preferred;
  return (
    <PaneSection label="Visibility">
      <div className="flex flex-col gap-1.5">
        <Toggle
          checked={preferred}
          disabled={busy}
          onChange={(on) => void save(on)}
          label="Discoverable"
        />
        <p className="text-xxs text-text-muted" role="status">
          {busy
            ? 'Saving visibility…'
            : !published
              ? preferred
                ? 'Will appear in Explore when you share.'
                : 'When shared, anyone with the link can view it. It will not be listed in Explore.'
              : !authenticated
                ? 'Connect your account to check or update the online listing.'
                : online === null
                  ? 'Online listing not confirmed.'
                  : differs
                    ? 'Your saved preference differs from the online listing.'
                    : online
                      ? 'Listed in Explore on crux.garden.'
                      : 'Not listed in Explore. Anyone with the link can view it.'}
        </p>
        {error && (
          <p role="alert" className="text-xxs text-error">
            {error}
          </p>
        )}
        {published && authenticated && (differs || error) && (
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy}
              className={linkClass()}
              onClick={() => void save(preferred, false)}
            >
              Retry listing update
            </button>
            <button
              disabled={busy}
              className={linkClass()}
              onClick={() => setRefresh((n) => n + 1)}
            >
              Check online listing
            </button>
          </div>
        )}
      </div>
    </PaneSection>
  );
}
