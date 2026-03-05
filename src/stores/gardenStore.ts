import { create } from 'zustand';
import { cruxes } from '@/api';
import type { Crux, PaginationMeta } from '@/api/types';

export type SortField = 'created' | 'updated';

interface GardenState {
  /** Raw list from API (unfiltered, unsorted) */
  allCruxes: Crux[];
  /** Filtered + sorted for display */
  cruxList: Crux[];
  loading: boolean;
  search: string;
  sortBy: SortField;
  pagination: PaginationMeta;

  load: () => Promise<void>;
  setSearch: (query: string) => void;
  setSortBy: (field: SortField) => void;
  setPage: (offset: number) => void;
  refresh: () => Promise<void>;
}

const DEFAULT_LIMIT = 1000;

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
  pagination: { limit: DEFAULT_LIMIT, offset: 0, total: 0 },

  load: async () => {
    set({ loading: true });
    try {
      const { search, sortBy, pagination } = get();
      const { data, meta } = await cruxes.list({
        limit: pagination.limit,
        offset: pagination.offset,
      });
      set({ allCruxes: data, cruxList: filterAndSort(data, search, sortBy), pagination: meta });
    } catch (err) {
      console.error('[gardenStore] Failed to load cruxes:', err);
    } finally {
      set({ loading: false });
    }
  },

  setSearch: (query: string) => {
    const { allCruxes, sortBy, pagination } = get();
    set({
      search: query,
      cruxList: filterAndSort(allCruxes, query, sortBy),
      pagination: { ...pagination, offset: 0 },
    });
  },

  setSortBy: (field: SortField) => {
    const { allCruxes, search } = get();
    set({ sortBy: field, cruxList: filterAndSort(allCruxes, search, field) });
  },

  setPage: (offset: number) => {
    set({ pagination: { ...get().pagination, offset } });
    get().load();
  },

  refresh: async () => {
    await get().load();
  },
}));
