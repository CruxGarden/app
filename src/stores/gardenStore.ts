import { create } from 'zustand';
import type { Crux } from '@/api/types';
import { getServices } from '@/services';
import { getSqliteClient } from '@/services/sqlite/client';
import { WORKSPACE_THUMBNAIL_PATH } from '@/lib/artifact-path';

export type SortField = 'created' | 'updated';

interface GardenState {
  /** Raw list (unfiltered, unsorted) */
  allCruxes: Crux[];
  /** Filtered + sorted for display */
  cruxList: Crux[];
  /** cruxId → fingerprint of its captured preview.jpg (only cruxes that have one). */
  thumbnails: Record<string, string>;
  loading: boolean;
  search: string;
  sortBy: SortField;

  load: () => Promise<void>;
  /** Delete a crux and refresh the list. */
  deleteCrux: (id: string) => Promise<void>;
  setSearch: (query: string) => void;
  setSortBy: (field: SortField) => void;
  refresh: () => Promise<void>;
}

function filterAndSort(cruxes: Crux[], search: string, sortBy: SortField): Crux[] {
  const needle = search.toLowerCase();
  const filtered = needle
    ? cruxes.filter(
        (c) =>
          (c.title || '').toLowerCase().includes(needle) ||
          (c.slug || '').toLowerCase().includes(needle) ||
          (c.description || '').toLowerCase().includes(needle),
      )
    : cruxes;
  return [...filtered].sort(
    (a, b) => new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime(),
  );
}

/**
 * One query for every crux's thumbnail: the workspace's preview.jpg artifact,
 * keyed by the crux that owns it. Snapshot clones carry their own copies under
 * the snapshot's id, so this naturally yields only live cruxes.
 */
async function loadThumbnails(): Promise<Record<string, string>> {
  try {
    const rows = await getSqliteClient().all<{ resource_id: string; fingerprint: string }>(
      `SELECT resource_id, fingerprint FROM artifacts
       WHERE resource_type = 'crux' AND fingerprint IS NOT NULL
         AND (lower(path) = ? OR lower(json_extract(meta, '$.path')) = ?)`,
      [WORKSPACE_THUMBNAIL_PATH, WORKSPACE_THUMBNAIL_PATH],
    );
    const map: Record<string, string> = {};
    for (const r of rows) map[r.resource_id] = r.fingerprint;
    return map;
  } catch (err) {
    console.warn('[gardenStore] thumbnails unavailable:', err);
    return {};
  }
}

export const useGardenStore = create<GardenState>((set, get) => ({
  allCruxes: [],
  cruxList: [],
  thumbnails: {},
  loading: true,
  search: '',
  sortBy: 'created',

  deleteCrux: async (id: string) => {
    const { crux: cruxService } = getServices();
    await cruxService.delete(id);
    await get().load();
  },

  load: async () => {
    set({ loading: true });
    try {
      const { search, sortBy } = get();
      const { crux: cruxService } = getServices();
      const [data, thumbnails] = await Promise.all([cruxService.listAll(), loadThumbnails()]);
      set({ allCruxes: data, cruxList: filterAndSort(data, search, sortBy), thumbnails });
    } catch (err) {
      console.error('[gardenStore] Failed to load cruxes:', err);
    } finally {
      set({ loading: false });
    }
  },

  setSearch: (query: string) => {
    const { allCruxes, sortBy } = get();
    set({
      search: query,
      cruxList: filterAndSort(allCruxes, query, sortBy),
    });
  },

  setSortBy: (field: SortField) => {
    const { allCruxes, search } = get();
    set({ sortBy: field, cruxList: filterAndSort(allCruxes, search, field) });
  },

  refresh: async () => {
    await get().load();
  },
}));
