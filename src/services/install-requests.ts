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

/** What looking up an install link's item found. */
export type PublishedLookup =
  | { kind: 'found'; crux: ExploreCrux }
  /** Not a live published Tool or Mood of the link's type (unpublished, taken down, mistyped). */
  | { kind: 'missing' }
  /** crux.garden did not answer (offline, timed out, a server error). */
  | { kind: 'offline' };

/**
 * Find the published Tool or Mood an install link names, by id — link-only
 * items included, so nothing needs to be listed in Explore. Never installs:
 * the answer only fills the confirmation.
 */
export async function lookUpPublished(
  request: InstallRequest,
  getPublishedPackage: (id: string, signal?: AbortSignal) => Promise<ExploreCrux>,
  signal?: AbortSignal,
): Promise<PublishedLookup> {
  try {
    const crux = await getPublishedPackage(request.cruxId, signal);
    // A tool link to a Mood (or the reverse) is not what the page offered.
    if (!crux || crux.kind !== request.type) return { kind: 'missing' };
    return { kind: 'found', crux };
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    return status === 404 || status === 400 ? { kind: 'missing' } : { kind: 'offline' };
  }
}

/** What the confirmation says when the item cannot be shown: plain words and the way round. */
export function installFallbackCopy(
  type: InstallRequest['type'],
  kind: Exclude<PublishedLookup['kind'], 'found'>,
): { message: string; file: string; link: string } {
  const noun = type === 'tool' ? 'Tool' : 'Mood';
  const file = type === 'tool' ? '.cruxtool' : '.cruxmood';
  return {
    message:
      kind === 'offline'
        ? `Could not reach crux.garden to find this ${noun}. Try the link again when you are online, or download its ${file} file from its page and import it from Add Crux.`
        : `This ${noun} is not published on crux.garden any more, or the link is incomplete. If you have its ${file} file, import it from Add Crux.`,
    file,
    link: `Find ${type === 'tool' ? 'Tools' : 'Moods'} on crux.garden`,
  };
}
