import client from './client';
import type { Attachment } from './types';

export async function get(id: string): Promise<Attachment> {
  const res = await client.get<Attachment>(`/attachments/${id}`);
  return res.data;
}

export async function download(cruxId: string, attachmentId: string): Promise<Blob> {
  const res = await client.get(`/cruxes/${cruxId}/attachments/${attachmentId}/download`, {
    responseType: 'blob',
    params: { v: Date.now() },
  });
  return res.data as Blob;
}
