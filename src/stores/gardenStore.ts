import { create } from 'zustand';
import type { Crux } from '@/api/types';
import { getServices } from '@/services';

export type SortField = 'created' | 'updated';

interface GardenState {
  /** Raw list (unfiltered, unsorted) */
  allCruxes: Crux[];
  /** Filtered + sorted for display */
  cruxList: Crux[];
  loading: boolean;
  search: string;
  sortBy: SortField;

  load: () => Promise<void>;
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

export const useGardenStore = create<GardenState>((set, get) => ({
  allCruxes: [],
  cruxList: [],
  loading: true,
  search: '',
  sortBy: 'created',

  load: async () => {
    set({ loading: true });
    try {
      const { search, sortBy } = get();
      const { crux: cruxService } = getServices();
      const data = await cruxService.listAll();
      set({ allCruxes: data, cruxList: filterAndSort(data, search, sortBy) });
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
