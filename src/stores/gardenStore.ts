import { create } from 'zustand';
import { cruxes } from '@/api';
import type { Crux, PaginationMeta } from '@/api/types';

interface GardenState {
  cruxList: Crux[];
  loading: boolean;
  search: string;
  pagination: PaginationMeta;

  load: () => Promise<void>;
  setSearch: (query: string) => void;
  setPage: (offset: number) => void;
  refresh: () => Promise<void>;
}

const DEFAULT_LIMIT = 24;

export const useGardenStore = create<GardenState>((set, get) => ({
  cruxList: [],
  loading: true,
  search: '',
  pagination: { limit: DEFAULT_LIMIT, offset: 0, total: 0 },

  load: async () => {
    set({ loading: true });
    try {
      const { search, pagination } = get();
      const { data, meta } = await cruxes.list({
        search: search || undefined,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      set({ cruxList: data, pagination: meta });
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

  setPage: (offset: number) => {
    set({ pagination: { ...get().pagination, offset } });
    get().load();
  },

  refresh: async () => {
    await get().load();
  },
}));
