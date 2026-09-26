import { create } from 'zustand';

export interface GardenIdentity {
  id: string;
  title?: string;
  slug: string;
  kind?: string | null;
}
/** Presentation selection only. Membership and content remain API-owned. */
export const useGardenContext = create<{
  root: GardenIdentity | null;
  garden: GardenIdentity | null;
  navigatorOpen: boolean;
  /** The Navigator's search text; it outlives the pane remounting at a new width. */
  navigatorQuery: string;
  setNavigatorQuery: (query: string) => void;
  revision: number;
  searchRequest: { token: number; closeOnExit: boolean; returnFocus: HTMLElement | null } | null;
  requestSearch: () => void;
  finishSearch: () => void;
  initialize: (root: GardenIdentity) => void;
  select: (garden: GardenIdentity) => void;
  setNavigatorOpen: (open: boolean) => void;
}>((set) => ({
  root: null,
  garden: null,
  navigatorOpen: false,
  navigatorQuery: '',
  setNavigatorQuery: (navigatorQuery) => set({ navigatorQuery }),
  revision: 0,
  searchRequest: null,
  requestSearch: () =>
    set((state) => ({
      navigatorOpen: true,
      searchRequest: {
        token: (state.searchRequest?.token ?? 0) + 1,
        closeOnExit: state.searchRequest?.closeOnExit ?? !state.navigatorOpen,
        returnFocus:
          state.searchRequest?.returnFocus ??
          (document.activeElement instanceof HTMLElement ? document.activeElement : null),
      },
    })),
  finishSearch: () => set({ searchRequest: null }),
  initialize: (root) => set({ root, garden: root }),
  select: (garden) => set({ garden }),
  setNavigatorOpen: (navigatorOpen) =>
    set((state) => ({ navigatorOpen, searchRequest: navigatorOpen ? state.searchRequest : null })),
}));

export const captureGardenId = () => useGardenContext.getState().garden?.id;

/** Garden and Crux form a shallow pair; containment depth never lengthens the route. */
export function inGarden(path: string, gardenId = captureGardenId()): string {
  if (!gardenId || !(path === '/home' || path.startsWith('/home?') || path.startsWith('/c/')))
    return path;
  const [route = '', hash] = path.split('#');
  const [pathname, query] = route.split('?');
  const params = new URLSearchParams(query);
  if (!params.has('garden')) params.set('garden', gardenId);
  return `${pathname}?${params}${hash ? `#${hash}` : ''}`;
}
export const gardenPath = (id: string) => `/home?garden=${encodeURIComponent(id)}`;

/** Enter a Garden's Home; only creative Cruxes open an editor workspace. */
export function cruxPath(
  crux: Pick<GardenIdentity, 'id' | 'kind'>,
  gardenId = captureGardenId(),
): string {
  return crux.kind === 'garden' ? gardenPath(crux.id) : inGarden(`/c/${crux.id}`, gardenId);
}
