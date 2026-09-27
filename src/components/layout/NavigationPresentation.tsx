import { cn } from '@/lib/cn';
import { iconButtonClass } from '@/components/ui/button-class';
import { fieldClass } from '@/components/ui/field-class';
import { linkClass } from '@/components/ui/button-class';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import {
  readNavigationPreferences,
  saveGardenNavigation,
  saveUserNavigation,
  isNavigationView,
  type ResolvedNavigation,
  type NavigationView,
} from '@/services/navigation-preferences';
import type { NavigationViewProps } from './navigation-view';
import NavigationTree from './NavigationTree';
import NavigationNeighborhood from './NavigationNeighborhood';
import NavigationGraph from './NavigationGraph';

export default function NavigationPresentation(
  props: NavigationViewProps & { refresh: () => void },
) {
  const authorId = useAppStore((s) => s.author?.id);
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const current = useRef('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const requestKey = `${props.gardenId}:${authorId}:${props.graph.revision}:${search.get('navView') ?? ''}`;
  current.current = location.key;
  const [loaded, setLoaded] = useState<{
    key: string;
    value?: ResolvedNavigation;
    error?: string;
  }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const raw = search.get('navView');
  const visit = isNavigationView(raw) ? raw : undefined;
  useEffect(() => {
    let active = true;
    if (!authorId) return;
    void readNavigationPreferences(authorId, props.gardenId, visit)
      .then((value) => {
        if (active) setLoaded({ key: requestKey, value });
      })
      .catch((cause: unknown) => {
        if (active)
          setLoaded({
            key: requestKey,
            error:
              cause instanceof Error ? cause.message : 'Navigation preferences are unavailable.',
          });
      });
    return () => {
      active = false;
    };
  }, [authorId, props.gardenId, requestKey, visit]);
  const state = loaded?.key === requestKey ? loaded : undefined;
  const preferences = state?.value;
  const view = preferences?.view ?? visit ?? 'tree';
  const busy = saving || !state;
  const update = async (operation: () => Promise<void>) => {
    const origin = location.key;
    setSaving(true);
    setError('');
    try {
      await operation();
      if (mounted.current && current.current === origin) {
        const next = new URLSearchParams(search);
        next.delete('navView');
        setSearch(next, { replace: true });
      }
    } catch (cause) {
      if (mounted.current && current.current === origin)
        setError(cause instanceof Error ? cause.message : 'Could not save navigation preferences.');
    } finally {
      setSaving(false);
    }
  };
  const options = (
    <>
      <option value="tree">Tree</option>
      <option value="neighborhood">Neighborhood</option>
      <option value="graph">Graph</option>
    </>
  );
  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-2">
        <select
          aria-label="Navigation view"
          disabled={busy || !preferences}
          value={view}
          onChange={(e) => {
            const value = e.target.value as NavigationView;
            void update(() =>
              saveUserNavigation(
                authorId!,
                preferences?.always
                  ? { defaultView: value }
                  : { gardenId: props.gardenId, view: value },
              ),
            );
          }}
          className={fieldClass(undefined, 'min-w-0 flex-1', 'sm')}
        >
          {options}
        </select>
        <button
          aria-label="Refresh navigation"
          onClick={props.refresh}
          className={iconButtonClass('sm')}
        >
          ↻
        </button>
      </div>
      {(error || state?.error) && (
        <div className="px-4 pb-2 text-xs">
          <p role="alert">{error || state?.error}</p>
          <button
            onClick={() => {
              setError('');
              props.refresh();
            }}
            className={linkClass()}
          >
            Retry navigation preferences
          </button>
        </div>
      )}
      <details className="px-4 pb-3 text-xs">
        <summary className="text-text-muted cursor-pointer">Navigation preferences</summary>
        <div className="flex flex-col gap-3 pt-3">
          {preferences && <p className="text-text-muted">Using: {preferences.source}</p>}
          <label className="flex flex-col gap-1">
            Garden view
            <select
              aria-label="Garden navigation preference"
              value={preferences?.ownView ?? ''}
              disabled={saving || !state}
              onChange={(e) => {
                const value = e.target.value as NavigationView | '';
                void update(() => saveGardenNavigation(props.gardenId, value || null));
              }}
              className="w-full rounded bg-surface p-1.5"
            >
              <option value="">Inherit</option>
              {options}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            My default
            <select
              aria-label="My default navigation view"
              value={preferences?.defaultView ?? 'tree'}
              disabled={busy || !preferences}
              onChange={(e) => {
                const value = e.target.value as NavigationView;
                void update(() => saveUserNavigation(authorId!, { defaultView: value }));
              }}
              className="w-full rounded bg-surface p-1.5"
            >
              {options}
            </select>
          </label>
          <label className="flex gap-2 items-start">
            <input
              type="checkbox"
              checked={preferences?.always ?? false}
              disabled={busy || !preferences}
              onChange={(e) => {
                const always = e.target.checked;
                void update(() => saveUserNavigation(authorId!, { always }));
              }}
            />
            Always use my view
          </label>
          {!preferences?.always && (preferences?.lastView || visit) && (
            <button
              disabled={busy}
              onClick={() =>
                void update(() =>
                  saveUserNavigation(authorId!, { gardenId: props.gardenId, view: null }),
                )
              }
              className={linkClass('text-left')}
            >
              Follow Garden preference
            </button>
          )}
        </div>
      </details>
      <div className={cn('overflow-y-auto flex-1 px-2 pb-4', view === 'graph' && 'flex flex-col')}>
        {view === 'tree' ? (
          <>
            <p className="px-2 pt-3 pb-2 text-xxs tracking-widest uppercase text-text-muted">
              On this device
            </p>
            <NavigationTree {...props} />
          </>
        ) : view === 'graph' ? (
          <NavigationGraph {...props} />
        ) : (
          <NavigationNeighborhood {...props} />
        )}
      </div>
    </>
  );
}
