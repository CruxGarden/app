import { isAxiosError } from 'axios';
import client from './client';

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

export async function pushGarden(blob: Blob): Promise<GardenStatus> {
  const form = new FormData();
  form.append('file', blob, 'garden.zip');
  const res = await client.put<GardenStatus>('/sync/garden', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000, // 5 min for large uploads
  });
  return res.data;
}

export async function pullGarden(): Promise<Blob> {
  const res = await client.get('/sync/garden', {
    responseType: 'blob',
    timeout: 300000,
  });
  return res.data;
}

export async function getGardenStatus(): Promise<GardenStatus | null> {
  try {
    const res = await client.get<GardenStatus>('/sync/garden/status');
    return res.data;
  } catch (e: unknown) {
    if (isAxiosError(e) && e.response?.status === 404) return null;
    throw e;
  }
}

export async function deleteGarden(): Promise<void> {
  await client.delete('/sync/garden');
}

// --- Crux ---

export async function pushCrux(
  cruxId: string,
  blob: Blob,
  meta: { slug: string; title: string },
): Promise<SyncedCrux> {
  const form = new FormData();
  form.append('file', blob, `${cruxId}.crux`);
  form.append('slug', meta.slug);
  form.append('title', meta.title);
  const res = await client.put<SyncedCrux>(`/sync/crux/${cruxId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
  });
  return res.data;
}

export async function pullCrux(cruxId: string): Promise<Blob> {
  const res = await client.get(`/sync/crux/${cruxId}`, {
    responseType: 'blob',
    timeout: 300000,
  });
  return res.data;
}

export async function listSyncedCruxes(): Promise<SyncedCrux[]> {
  const res = await client.get<SyncedCrux[]>('/sync/crux');
  return res.data;
}

export async function deleteSyncedCrux(cruxId: string): Promise<void> {
  await client.delete(`/sync/crux/${cruxId}`);
}
