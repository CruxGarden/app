import client from './client';
import type { Path, Marker, CruxVisibility, PathKind, PaginationMeta } from './types';

// ── Paths ────────────────────────────────────────────

interface ListParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export async function list(
  params?: ListParams,
): Promise<{ data: Path[]; meta: PaginationMeta }> {
  const query: Record<string, string> = {};
  if (params?.search) query.search = params.search;
  if (params?.limit) query.limit = String(params.limit);
  if (params?.offset) query.offset = String(params.offset);

  const res = await client.get<Path[]>('/paths', { params: query });

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
      // Header not parseable
    }
  }

  if (!meta.total && res.data.length > 0) {
    meta.total = res.data.length;
  }

  return { data: res.data, meta };
}

export async function get(identifier: string): Promise<Path> {
  const res = await client.get<Path>(`/paths/${identifier}`);
  return res.data;
}

interface CreatePathDto {
  slug: string;
  title?: string;
  description?: string;
  type?: string;
  visibility?: CruxVisibility;
  kind: PathKind;
  entry: string;
  themeId?: string;
}

export async function create(dto: CreatePathDto): Promise<Path> {
  const res = await client.post<Path>('/paths', dto);
  return res.data;
}

interface UpdatePathDto {
  title?: string;
  description?: string;
  type?: string;
  visibility?: CruxVisibility;
  kind?: PathKind;
  entry?: string;
  themeId?: string;
}

export async function update(id: string, dto: UpdatePathDto): Promise<Path> {
  const res = await client.patch<Path>(`/paths/${id}`, dto);
  return res.data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/paths/${id}`);
}

// ── Markers ──────────────────────────────────────────

export async function getMarkers(pathId: string): Promise<Marker[]> {
  const res = await client.get<Marker[]>(`/paths/${pathId}/markers`);
  return res.data;
}

interface MarkerInput {
  cruxId: string;
  order: number;
  note?: string;
}

export async function syncMarkers(pathId: string, markers: MarkerInput[]): Promise<Marker[]> {
  const res = await client.put<Marker[]>(`/paths/${pathId}/markers`, { markers });
  return res.data;
}
