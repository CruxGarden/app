import { captureGardenId } from './gardenContext';
import { gardenMembers, opensAsWorkspace } from '@/services/garden-navigation';
import { allWorkspaces } from './workspaceRegistry';

import { create } from 'zustand';
import type { Crux } from '@/api/types';
import { getServices } from '@/services';
import { getSqliteClient } from '@/services/sqlite/client';
import { WORKSPACE_THUMBNAIL_PATH } from '@/lib/artifact-path';

export type SortField = 'created' | 'updated';

/** How long a deleted crux waits in the Trash before it is purged for good. */
export const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

interface GardenState {
  /** Raw list (unfiltered, unsorted) */
  allCruxes: Crux[];
  /** Filtered + sorted for display */
  cruxList: Crux[];
  /** Cruxes in the Trash — hidden from the grid, restorable until purged. */
  trashed: Crux[];
  /** cruxId → fingerprint of its captured preview.jpg (only cruxes that have one). */
  thumbnails: Record<string, string>;
  loading: boolean;
  error: string | null;
  search: string;
  sortBy: SortField;

  load: () => Promise<void>;
  /** Move a crux to the Trash and refresh the lists. */
  deleteCrux: (id: string) => Promise<void>;
  /** Bring a trashed crux back to the garden. */
  restoreCrux: (id: string) => Promise<void>;
  /** Delete a trashed crux for good — rows gone, the Project Folder left where it is. */
  destroyCrux: (id: string) => Promise<void>;
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

const thumbnailRoots = new Map<string, { root: string; fingerprint: string | null }>();
/** Lookup only preview metadata in each changed root; never list a project's files. */
async function loadThumbnails(): Promise<Record<string, string>> {
  try {
    const db = getSqliteClient();
    if (db.fileContent) {
      const content = db.fileContent;
      const heads = await db.all<{ crux_id: string; root: string; revision: number }>(
        "SELECT h.* FROM file_content_heads h JOIN cruxes c ON c.id = h.crux_id WHERE c.deleted IS NULL AND (c.kind IS NULL OR c.kind <> 'snapshot')",
      );
      const map: Record<string, string> = {};
      const owners = new Set(heads.map((head) => head.crux_id));
      for (const id of thumbnailRoots.keys()) if (!owners.has(id)) thumbnailRoots.delete(id);
      for (const head of heads) {
        let cached = thumbnailRoots.get(head.crux_id);
        if (cached?.root !== head.root) {
          const file = await content.lookup({
            cruxId: head.crux_id,
            expected: head,
            path: WORKSPACE_THUMBNAIL_PATH,
          });
          cached = { root: head.root, fingerprint: file?.entry.fingerprint ?? null };
          thumbnailRoots.set(head.crux_id, cached);
        }
        if (cached.fingerprint) map[head.crux_id] = cached.fingerprint;
      }
      return map;
    }
    const rows = await db.all<{ resource_id: string; fingerprint: string }>(
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

let loadGeneration = 0;

/** The Garden's lists as one read: its Cruxes (or every Crux without a Garden), the Trash, thumbnails. */
async function fetchLists({ search, sortBy }: { search: string; sortBy: SortField }) {
  const gardenId = captureGardenId();
  const { crux: cruxService } = getServices();
  const [data, trashed, thumbnails] = await Promise.all([
    gardenId
      ? gardenMembers(gardenId).then((rows) => rows.filter(opensAsWorkspace))
      : cruxService.listAll(),
    cruxService.listTrashed(),
    loadThumbnails(),
  ]);
  return { allCruxes: data, cruxList: filterAndSort(data, search, sortBy), trashed, thumbnails };
}

export const useGardenStore = create<GardenState>((set, get) => ({
  allCruxes: [],
  cruxList: [],
  trashed: [],
  thumbnails: {},
  loading: true,
  error: null,
  search: '',
  sortBy: 'created',

  deleteCrux: async (id: string) => {
    if (allWorkspaces().some((w) => w.cruxId === id))
      throw new Error('Close this Crux workspace before deleting it.');
    const { crux: cruxService } = getServices();
    await cruxService.trash(id);
    await get().load();
  },

  restoreCrux: async (id: string) => {
    await getServices().crux.restore(id);
    await get().load();
  },

  destroyCrux: async (id: string) => {
    await getServices().crux.delete(id);
    await get().load();
  },

  load: async () => {
    const generation = ++loadGeneration;
    set({ loading: true, error: null });
    try {
      await getServices().crux.purgeTrash(TRASH_RETENTION_MS).catch((err) => {
        console.warn('[gardenStore] trash purge skipped:', err);
      });
      const patch = await fetchLists(get());
      if (generation === loadGeneration) set({ ...patch, loading: false, error: null });
    } catch (err) {
      if (generation === loadGeneration) set({ loading: false, error: (err as Error).message });
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

  /** Reload the lists in place: no `loading` flip, so the Home Garden stays mounted. */
  refresh: async () => {
    const generation = ++loadGeneration;
    try {
      const patch = await fetchLists(get());
      if (generation === loadGeneration) set({ ...patch, loading: false, error: null });
    } catch (err) {
      console.error('[gardenStore] Failed to refresh cruxes:', err);
      if (generation === loadGeneration) set({ loading: false, error: (err as Error).message });
    }
  },
}));
