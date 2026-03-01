import client from './client';
import type {
  Crux,
  CreateCruxDto,
  UpdateCruxDto,
  Dimension,
  DimensionType,
  CreateDimensionDto,
  Attachment,
  Tag,
  PaginationMeta,
} from './types';

// ── List + Search ────────────────────────────────────

interface ListParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export async function list(params?: ListParams): Promise<{ data: Crux[]; meta: PaginationMeta }> {
  const query: Record<string, string> = {};
  if (params?.search) query.search = params.search;
  if (params?.limit) query.limit = String(params.limit);
  if (params?.offset) query.offset = String(params.offset);

  const res = await client.get<Crux[]>('/cruxes', { params: query });

  // Parse pagination from response headers
  const paginationHeader = res.headers['pagination'];
  let meta: PaginationMeta = {
    limit: params?.limit || 24,
    offset: params?.offset || 0,
    total: 0,
  };

  if (paginationHeader) {
    try {
      meta = JSON.parse(paginationHeader);
    } catch {
      // Header not parseable — use defaults
    }
  }

  // Fallback: estimate total from data length when no header
  if (!meta.total && res.data.length > 0) {
    meta.total = res.data.length;
  }

  return { data: res.data, meta };
}

export async function get(identifier: string): Promise<Crux> {
  const res = await client.get<Crux>(`/cruxes/${identifier}`);
  return res.data;
}

export async function create(dto: CreateCruxDto): Promise<Crux> {
  const res = await client.post<Crux>('/cruxes', dto);
  return res.data;
}

export async function update(id: string, dto: UpdateCruxDto): Promise<Crux> {
  const res = await client.patch<Crux>(`/cruxes/${id}`, dto);
  return res.data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/cruxes/${id}`);
}

// ── Dimensions ────────────────────────────────────────

export async function getDimensions(
  cruxId: string,
  type?: DimensionType,
  embed?: string,
): Promise<Dimension[]> {
  const params: Record<string, string> = {};
  if (type) params.type = type;
  if (embed) params.embed = embed;
  const res = await client.get<Dimension[]>(`/cruxes/${cruxId}/dimensions`, { params });
  return res.data;
}

export async function createDimension(cruxId: string, dto: CreateDimensionDto): Promise<Dimension> {
  const res = await client.post<Dimension>(`/cruxes/${cruxId}/dimensions`, dto);
  return res.data;
}

// ── Attachments ───────────────────────────────────────

export async function getAttachments(cruxId: string): Promise<Attachment[]> {
  const res = await client.get<Attachment[]>(`/cruxes/${cruxId}/attachments`);
  return res.data;
}

export async function uploadAttachment(
  cruxId: string,
  file: File,
  meta?: { type?: string; kind?: string; path?: string },
): Promise<Attachment> {
  const form = new FormData();
  form.append('file', file);
  if (meta?.type) form.append('type', meta.type);
  if (meta?.kind) form.append('kind', meta.kind);
  if (meta?.path) form.append('meta', JSON.stringify({ path: meta.path }));
  const res = await client.post<Attachment>(`/cruxes/${cruxId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function downloadAttachment(cruxId: string, attachmentId: string): Promise<Blob> {
  const res = await client.get(`/cruxes/${cruxId}/attachments/${attachmentId}/download`, {
    responseType: 'blob',
    params: { v: Date.now() },
  });
  return res.data as Blob;
}

export async function updateAttachment(
  attachmentId: string,
  file?: File,
  meta?: Record<string, unknown>,
): Promise<Attachment> {
  const form = new FormData();
  if (file) form.append('file', file);
  if (meta) form.append('meta', JSON.stringify(meta));
  const res = await client.put<Attachment>(`/attachments/${attachmentId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await client.delete(`/attachments/${attachmentId}`);
}

// ── Publishing ────────────────────────────────────────

export async function publish(cruxId: string): Promise<Crux> {
  const res = await client.post<Crux>(`/cruxes/${cruxId}/publish`);
  return res.data;
}

export async function unpublish(cruxId: string): Promise<Crux> {
  const res = await client.post<Crux>(`/cruxes/${cruxId}/unpublish`);
  return res.data;
}

// ── Tags ──────────────────────────────────────────────

export async function getTags(cruxId: string): Promise<Tag[]> {
  const res = await client.get<Tag[]>(`/cruxes/${cruxId}/tags`);
  return res.data;
}

export async function syncTags(cruxId: string, labels: string[]): Promise<Tag[]> {
  const res = await client.put<Tag[]>(`/cruxes/${cruxId}/tags`, { labels });
  return res.data;
}
