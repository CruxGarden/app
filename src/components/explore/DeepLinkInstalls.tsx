import { useEffect } from 'react';
import { subscribeDeepLinks } from '@/services/deep-links';
import { routeDeepLink, useInstallRequest } from '@/services/install-requests';
import { getServices } from '@/services';
import { cruxPath } from '@/stores/gardenContext';
import { useUIStore } from '@/stores/uiStore';
import { toast } from '@/stores/toastStore';
import { useAppStore } from '@/stores/appStore';
import { startUpdateChecks } from '@/services/update-notices';

/**
 * Installing from outside the app, app-wide: answers `install` and
 * `open-crux` deep links (ADR 0085) — an install link only asks; Explore opens
 * on that item's confirmation — and, once the garden is ready, checks
 * installed Tools and Moods for updates on start and every few hours.
 */
export default function DeepLinkInstalls({
  navigate,
  pathname,
}: {
  navigate: (to: string) => void;
  pathname: () => string;
}) {
  useEffect(
    () =>
      subscribeDeepLinks(
        (link) =>
          void routeDeepLink(link, {
            askToInstall: (request) => useInstallRequest.getState().ask(request),
            openExplore: (type) => {
              const path = pathname();
              // In a workspace Explore is a pane; elsewhere it is its own page.
              if (path.startsWith('/home') || path.startsWith('/c/'))
                useUIStore.getState().openExplore(type);
              else navigate(`/explore?type=${type === 'tool' ? 'tools' : 'moods'}`);
            },
            findLocalCrux: async (cruxId) => {
              try {
                return await getServices().crux.findById(cruxId);
              } catch {
                return null;
              }
            },
            openCrux: (crux) =>
              navigate(cruxPath({ id: crux.id, kind: crux.kind ?? null })),
            notify: (message) => toast(message),
          }),
        { kinds: ['install', 'open-crux'] },
      ),
    [navigate, pathname],
  );
  const ready = useAppStore((s) => s.ready);
  useEffect(() => (ready ? startUpdateChecks() : undefined), [ready]);
  return null;
}
