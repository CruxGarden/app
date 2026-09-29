import client from './client';
import { captureAuth, type AuthContext } from './session';
import type {
  Crux,
  CreateCruxDto,
  UpdateCruxDto,
  Dimension,
  DimensionType,
  CreateDimensionDto,
  Artifact,
  Tag,
} from './types';

// ── List + Search ────────────────────────────────────

interface ListParams {
  search?: string;
  page?: number;
  perPage?: number;
}

interface CruxPage {
  currentPage: number;
  perPage: number;
  total: number;
  lastPage: number;
}

export async function list(
  params: ListParams = {},
  context: AuthContext = captureAuth(),
): Promise<{ data: Crux[]; meta: CruxPage }> {
  const res = await client.get<Crux[]>('/cruxes', { params, authContext: context });
  let meta: CruxPage;
  try {
    meta = JSON.parse(res.headers['pagination']);
    if (
      !meta ||
      ![meta.currentPage, meta.perPage, meta.total, meta.lastPage].every(Number.isSafeInteger) ||
      meta.currentPage !== (params.page ?? 1) ||
      meta.perPage < 1 ||
      meta.perPage > 100 ||
      meta.total < 0 ||
      meta.lastPage < 1 ||
      meta.lastPage > 1_000_000
    )
      throw new Error();
  } catch {
    throw new Error('The account returned invalid pagination. Please try again.');
  }
  return { data: res.data, meta };
}

/** Keep every page bound to the account connection that started the read. */
export async function listAll(context: AuthContext = captureAuth()): Promise<Crux[]> {
  const cruxes = new Map<string, Crux>();
  let page = 1;
  let perPage = 100;
  while (true) {
    const result = await list({ page, perPage }, context);
    for (const crux of result.data) cruxes.set(crux.id, crux);
    if (page >= result.meta.lastPage) return [...cruxes.values()];
    if (result.data.length === 0)
      throw new Error('The account returned an incomplete Crux list. Please try again.');
    perPage = result.meta.perPage;
    page++;
  }
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

export async function getArtifacts(cruxId: string): Promise<Artifact[]> {
  const res = await client.get<Artifact[]>(`/cruxes/${cruxId}/artifacts`);
  return res.data;
}

export async function uploadArtifact(
  cruxId: string,
  file: File,
  meta?: { type?: string; kind?: string; path?: string },
): Promise<Artifact> {
  const form = new FormData();
  form.append('file', file);
  if (meta?.type) form.append('type', meta.type);
  if (meta?.kind) form.append('kind', meta.kind);
  if (meta?.path) form.append('meta', JSON.stringify({ path: meta.path }));
  const res = await client.post<Artifact>(`/cruxes/${cruxId}/artifacts`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function downloadArtifact(cruxId: string, artifactId: string): Promise<Blob> {
  const res = await client.get(`/cruxes/${cruxId}/artifacts/${artifactId}/download`, {
    responseType: 'blob',
    params: { v: Date.now() },
  });
  return res.data as Blob;
}

export async function updateArtifact(
  artifactId: string,
  file?: File,
  meta?: Record<string, unknown>,
): Promise<Artifact> {
  const form = new FormData();
  if (file) form.append('file', file);
  if (meta) form.append('meta', JSON.stringify(meta));
  const res = await client.put<Artifact>(`/artifacts/${artifactId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteArtifact(artifactId: string): Promise<void> {
  await client.delete(`/artifacts/${artifactId}`);
}

// ── Publishing ────────────────────────────────────────

export async function publish(
  cruxId: string,
  files: Array<{ blob: Blob; path: string; type?: string; kind?: string; mimeType: string }>,
): Promise<Crux> {
  const form = new FormData();
  const metas: Array<{ path: string; type?: string; kind?: string }> = [];

  for (const { blob, path, type, kind, mimeType } of files) {
    const fileName = path.split('/').pop() || 'file';
    form.append('files', new File([blob], fileName, { type: mimeType }));
    metas.push({ path, type, kind });
  }

  form.append('meta', JSON.stringify(metas));

  const res = await client.post<Crux>(`/cruxes/${cruxId}/publish`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return res.data;
}

export async function unpublish(cruxId: string): Promise<Crux> {
  const res = await client.post<Crux>(
    `/cruxes/${cruxId}/unpublish`,
    {},
    {
      timeout: 60000,
    },
  );
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
