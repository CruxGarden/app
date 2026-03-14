import client from './client';
import type { Artifact } from './types';

export async function get(id: string): Promise<Artifact> {
  const res = await client.get<Artifact>(`/attachments/${id}`);
  return res.data;
}

export async function download(cruxId: string, artifactId: string): Promise<Blob> {
  const res = await client.get(`/cruxes/${cruxId}/attachments/${artifactId}/download`, {
    responseType: 'blob',
    params: { v: Date.now() },
  });
  return res.data as Blob;
}
