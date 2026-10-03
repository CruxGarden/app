import client from './client';
import { captureAuth, type AuthContext } from './session';

export interface GardenStatus {
  syncedAt: string;
  size: number;
}

export interface SyncedCrux {
  cruxId: string;
  slug: string;
  title: string;
  updatedAt: string;
  size: number;
}

// --- Garden ---

export async function pushGarden(
  blob: Blob,
  context: AuthContext = captureAuth(),
): Promise<GardenStatus> {
  const form = new FormData();
  form.append('file', blob, 'garden.zip');
  const res = await client.put<GardenStatus>('/sync/garden', form, {
    authContext: context,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000, // 5 min for large uploads
  });
  return res.data;
}

export async function pullGarden(context: AuthContext = captureAuth()): Promise<Blob> {
  const res = await client.get('/sync/garden', {
    authContext: context,
    responseType: 'blob',
    timeout: 300000,
  });
  return res.data;
}

export async function getGardenStatus(
  context: AuthContext = captureAuth(),
): Promise<GardenStatus | null> {
  try {
    const res = await client.get<GardenStatus>('/sync/garden/status', { authContext: context });
    return res.data;
  } catch (e: unknown) {
    if ((e as { response?: { status?: number } })?.response?.status === 404) return null;
    throw e;
  }
}

export async function deleteGarden(context: AuthContext = captureAuth()): Promise<void> {
  await client.delete('/sync/garden', { authContext: context });
}

// --- Crux ---

export async function pushCrux(
  cruxId: string,
  blob: Blob,
  meta: { slug: string; title: string },
  context: AuthContext = captureAuth(),
): Promise<SyncedCrux> {
  const form = new FormData();
  form.append('file', blob, `${cruxId}.crux`);
  form.append('slug', meta.slug);
  form.append('title', meta.title);
  const res = await client.put<SyncedCrux>(`/sync/crux/${cruxId}`, form, {
    authContext: context,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  });
  return res.data;
}

export async function pullCrux(
  cruxId: string,
  context: AuthContext = captureAuth(),
): Promise<Blob> {
  const res = await client.get(`/sync/crux/${cruxId}`, {
    authContext: context,
    responseType: 'blob',
    timeout: 300000,
  });
  return res.data;
}

export async function listSyncedCruxes(
  context: AuthContext = captureAuth(),
): Promise<SyncedCrux[]> {
  const res = await client.get<SyncedCrux[]>('/sync/crux', { authContext: context });
  return res.data;
}

export async function deleteSyncedCrux(
  cruxId: string,
  context: AuthContext = captureAuth(),
): Promise<void> {
  await client.delete(`/sync/crux/${cruxId}`, { authContext: context });
}
