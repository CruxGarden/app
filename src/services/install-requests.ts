/**
 * Install from the website (ADR 0085 deep links): "Open in Crux Garden" on a
 * public Tool or Mood page hands the app `crux-garden://install/...`. The app
 * never installs on a link alone — it opens Explore and shows that item's
 * install confirmation, where the person presses Install themselves.
 * `open-crux` opens a Crux only when it is already in this garden.
 */
import { create } from 'zustand';
import type { ExploreCrux } from '@/api/public';
import type { DeepLink } from './deep-links';

export interface InstallRequest {
  type: 'tool' | 'mood';
  cruxId: string;
}

interface InstallRequestState {
  request: InstallRequest | null;
  ask: (request: InstallRequest) => void;
  clear: () => void;
}

/** The one pending "install this?" question Explore answers. */
export const useInstallRequest = create<InstallRequestState>((set) => ({
  request: null,
  ask: (request) => set({ request }),
  clear: () => set({ request: null }),
}));

export interface DeepLinkRoutes {
  /** Show the install confirmation for this item (never installs). */
  askToInstall: (request: InstallRequest) => void;
  /** Bring Explore forward on the right tab. */
  openExplore: (type: 'tool' | 'mood') => void;
  /** Resolve a local Crux by id; null when this garden does not have it. */
  findLocalCrux: (cruxId: string) => Promise<{ id: string; kind?: string | null } | null>;
  openCrux: (crux: { id: string; kind?: string | null }) => void;
  notify: (message: string) => void;
}

/** What a deep link does in the app. Returns what happened, for tests and logs. */
export async function routeDeepLink(
  link: DeepLink,
  routes: DeepLinkRoutes,
): Promise<'asked-to-install' | 'opened-crux' | 'crux-not-here' | 'ignored'> {
  if (link.kind === 'install') {
    routes.askToInstall({ type: link.type, cruxId: link.cruxId });
    routes.openExplore(link.type);
    return 'asked-to-install';
  }
  if (link.kind === 'open-crux') {
    const crux = await routes.findLocalCrux(link.cruxId).catch(() => null);
    if (!crux) {
      routes.notify('That Crux is not in this garden.');
      return 'crux-not-here';
    }
    routes.openCrux(crux);
    return 'opened-crux';
  }
  return 'ignored';
}

/**
 * Find a published Tool or Mood by id in Explore. A link-only Mood is not
 * listed, so null is a normal answer: the confirmation then points the person
 * back to the page's download.
 */
export async function findPublished(
  request: InstallRequest,
  explore: (
    params: { type: 'cruxes'; kind: string; perPage: number; page: number },
    signal?: AbortSignal,
  ) => Promise<{ items: unknown[]; totalPages: number }>,
  signal?: AbortSignal,
  maxPages = 5,
): Promise<ExploreCrux | null> {
  for (let page = 1; page <= maxPages; page++) {
    const result = await explore(
      { type: 'cruxes', kind: request.type, perPage: 100, page },
      signal,
    );
    const found = (result.items as ExploreCrux[]).find(
      (item) =>
        item?.id?.toLowerCase() === request.cruxId.toLowerCase() && item.kind === request.type,
    );
    if (found) return found;
    if (page >= result.totalPages) break;
  }
  return null;
}
