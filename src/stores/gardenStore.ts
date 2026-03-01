import { create } from 'zustand';
import { cruxes } from '@/api';
import type { Crux, PaginationMeta } from '@/api/types';

export type SortField = 'created' | 'updated';

interface GardenState {
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

export const useGardenStore = create<GardenState>((set, get) => ({
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
      // Filter client-side (API doesn't support search yet)
      const needle = search.toLowerCase();
      const filtered = needle
        ? data.filter(
            (c) =>
              (c.title || '').toLowerCase().includes(needle) ||
              (c.slug || '').toLowerCase().includes(needle) ||
              (c.description || '').toLowerCase().includes(needle),
          )
        : data;
      // Sort client-side (newest first)
      const sorted = [...filtered].sort(
        (a, b) => new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime(),
      );
      set({ cruxList: sorted, pagination: meta });
    } catch (err) {
      console.error('[gardenStore] Failed to load cruxes:', err);
    } finally {
      set({ loading: false });
    }
  },

  setSearch: (query: string) => {
    set({ search: query, pagination: { ...get().pagination, offset: 0 } });
    get().load();
  },

  setSortBy: (field: SortField) => {
    set({ sortBy: field });
    get().load();
  },

  setPage: (offset: number) => {
    set({ pagination: { ...get().pagination, offset } });
    get().load();
  },

  refresh: async () => {
    await get().load();
  },
}));
