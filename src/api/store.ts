import client from './client';

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
