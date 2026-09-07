import client from './client';
import type { StoreExport } from '@/lib/store-export';

/**
 * The published crux's Crux Store as the API holds it — what visitors of the
 * live site wrote. Author-only reads; per-visitor (`protected`) rows come back
 * with their visitorId so the pane can show them as a live data explorer.
 */
export interface LiveStoreEntry {
  key: string;
  value: unknown;
  mode: 'public' | 'protected';
  visitorId: string | null;
  updatedAt: string;
}

export async function listLive(cruxId: string): Promise<LiveStoreEntry[]> {
  const { data } = await client.get<LiveStoreEntry[]>(`/store/${cruxId}`);
  return data;
}

/** Author delete: removes every slot of the key (public value and all visitors'). */
export async function deleteLive(cruxId: string, key: string): Promise<void> {
  await client.delete(`/store/${cruxId}/${encodeURIComponent(key)}`);
}

export async function clearLive(cruxId: string): Promise<void> {
  await client.delete(`/store/${cruxId}`);
}

/** The whole live store as one document — the file Export saves. */
export async function exportLive(cruxId: string): Promise<StoreExport> {
  const { data } = await client.get<StoreExport>(`/store/${cruxId}/-/export`);
  return data;
}

/** Load a document into the live store: merge over what is there, or replace it. */
export async function importLive(
  cruxId: string,
  doc: StoreExport,
  mode: 'merge' | 'replace' = 'merge',
): Promise<{ imported: number; skipped: number }> {
  const { data } = await client.post<{ imported: number; skipped: number }>(
    `/store/${cruxId}/-/import`,
    doc,
    { params: { mode } },
  );
  return data;
}
