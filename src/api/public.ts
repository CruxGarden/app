/**
 * Public API client for display mode.
 *
 * Uses plain fetch (no auth interceptors) so published cruxes
 * can be viewed without logging in.
 */

import { apiBaseUrl } from './client';
import type { Author, Crux, Artifact } from './types';

const base = () => apiBaseUrl();

export class PublicApiError extends Error {
  constructor(public readonly status: number) {
    super(`Public request failed (HTTP ${status})`);
  }
}

/** No auth, bounded wait, and cancellation when visitors leave a page. */
async function request(url: string, signal?: AbortSignal): Promise<Response> {
  const timeout = AbortSignal.timeout(20_000);
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!res.ok) throw new PublicApiError(res.status);
  return res;
}

function authorPath(username: string): string {
  const clean = username.startsWith('@') ? username.slice(1) : username;
  return `${base()}/authors/${encodeURIComponent(clean)}`;
}

export async function getAuthor(username: string, signal?: AbortSignal): Promise<Author> {
  const res = await request(authorPath(username), signal);
  return res.json();
}

export async function getAuthorCruxes(
  username: string,
  params?: { page?: number; perPage?: number; kind?: string },
  signal?: AbortSignal,
): Promise<{ cruxes: Crux[]; totalPages: number; currentPage: number }> {
  const url = new URL(`${authorPath(username)}/cruxes`);
  if (params?.page) url.searchParams.set('page', String(params.page));
  if (params?.perPage) url.searchParams.set('perPage', String(params.perPage));
  if (params?.kind && params.kind !== 'all') url.searchParams.set('kind', params.kind);
  const res = await request(url.toString(), signal);
  const cruxes = await res.json();
  const pagination = JSON.parse(res.headers.get('Pagination') || '{}');
  return {
    cruxes,
    totalPages: pagination.lastPage || 1,
    currentPage: pagination.currentPage || 1,
  };
}

export async function getCruxBySlug(
  username: string,
  slug: string,
  signal?: AbortSignal,
): Promise<Crux> {
  const res = await request(`${authorPath(username)}/cruxes/${encodeURIComponent(slug)}`, signal);
  return res.json();
}

export async function getArtifacts(
  username: string,
  slug: string,
  signal?: AbortSignal,
): Promise<Artifact[]> {
  const res = await request(
    `${authorPath(username)}/cruxes/${encodeURIComponent(slug)}/artifacts`,
    signal,
  );
  return res.json();
}

export function getDownloadUrl(username: string, slug: string, artifactId: string): string {
  return `${authorPath(username)}/cruxes/${encodeURIComponent(slug)}/artifacts/${encodeURIComponent(artifactId)}/download`;
}

export interface DownloadProgress {
  received: number;
  total?: number;
}

/** Downloads have a separate budget from metadata requests and release their
 * reader/timers on failure or cancellation. Never hand a partial Blob to import. */
export async function downloadArtifact(
  username: string,
  slug: string,
  artifactId: string,
  signal?: AbortSignal,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<Blob> {
  const deadline = new AbortController();
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  const expired = () =>
    deadline.abort(new DOMException('Download stalled. Please retry.', 'TimeoutError'));
  let idle = setTimeout(expired, 60_000);
  const overall = setTimeout(
    () => deadline.abort(new DOMException('Download took too long. Please retry.', 'TimeoutError')),
    15 * 60_000,
  );
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    combined.throwIfAborted();
    const res = await fetch(getDownloadUrl(username, slug, artifactId), { signal: combined });
    if (!res.ok) throw new PublicApiError(res.status);
    if (!res.body) throw new Error('The download was empty. Please retry.');
    const length = Number(res.headers.get('content-length'));
    const total = !res.headers.get('content-encoding') && length > 0 ? length : undefined;
    const limit = 500 * 1024 * 1024;
    if (total && total > limit) throw new Error('This download exceeds the 500 MB limit.');
    reader = res.body.getReader();
    let received = 0;
    const chunks: BlobPart[] = [];
    onProgress?.({ received, total });
    while (true) {
      combined.throwIfAborted();
      const { done, value } = await reader.read();
      combined.throwIfAborted();
      if (done) break;
      received += value.byteLength;
      if (received > limit) throw new Error('This download exceeds the 500 MB limit.');
      chunks.push(value as BlobPart);
      clearTimeout(idle);
      idle = setTimeout(expired, 60_000);
      onProgress?.({ received, total });
    }
    if (total && received !== total) throw new Error('The download was incomplete. Please retry.');
    return new Blob(chunks, {
      type: res.headers.get('content-type') || 'application/octet-stream',
    });
  } finally {
    clearTimeout(idle);
    clearTimeout(overall);
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}

// ── Explore ───────────────────────────────────────────

export type ExploreSort = 'relevant' | 'recent' | 'newest' | 'alpha';

export interface ExploreParams {
  q?: string;
  type?: 'cruxes' | 'authors';
  tag?: string[];
  /** Crux kind: webapp, page, document, image, notes, mood */
  kind?: string;
  /** Author username */
  author?: string;
  sort?: ExploreSort;
  page?: number;
  perPage?: number;
}

export interface ExploreCrux {
  id: string;
  slug: string;
  title?: string;
  description?: string;
  kind?: string;
  meta?: Record<string, unknown>;
  tags?: string[];
  created: string;
  updated: string;
  author_username: string;
  author_display_name: string;
  author_meta?: Record<string, unknown>;
}

export interface ExploreAuthor {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  meta?: Record<string, unknown>;
  created: string;
}

export interface ExploreTag {
  label: string;
  count: number;
}

export async function explore(
  params?: ExploreParams,
  signal?: AbortSignal,
): Promise<{ items: (ExploreCrux | ExploreAuthor)[]; totalPages: number; currentPage: number }> {
  const url = new URL(`${base()}/explore`);
  if (params?.q) url.searchParams.set('q', params.q);
  if (params?.type) url.searchParams.set('type', params.type);
  if (params?.sort) url.searchParams.set('sort', params.sort);
  if (params?.kind) url.searchParams.set('kind', params.kind);
  if (params?.author) url.searchParams.set('author', params.author);
  if (params?.page) url.searchParams.set('page', String(params.page));
  if (params?.perPage) url.searchParams.set('perPage', String(params.perPage));
  if (params?.tag) {
    for (const t of params.tag) url.searchParams.append('tag', t);
  }
  const res = await request(url.toString(), signal);
  const items = await res.json();
  const pagination = JSON.parse(res.headers.get('Pagination') || '{}');
  return {
    items,
    totalPages: pagination.lastPage || 1,
    currentPage: pagination.currentPage || 1,
  };
}

export async function exploreTags(
  limit?: number,
  kind?: string,
  signal?: AbortSignal,
): Promise<ExploreTag[]> {
  const url = new URL(`${base()}/explore/tags`);
  if (kind) url.searchParams.set('kind', kind);
  if (limit) url.searchParams.set('limit', String(limit));
  const res = await request(url.toString(), signal);
  const body = await res.json();
  return body.data;
}

// ── Reports ───────────────────────────────────────────

export const REPORT_REASONS = ['illegal', 'harmful', 'spam', 'copyright', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface CruxReport {
  cruxId: string;
  reason: ReportReason;
  details?: string;
  email?: string;
}

/** Report a published creation. Anyone may; the API rate-limits (429). */
export async function reportCrux(report: CruxReport, signal?: AbortSignal): Promise<void> {
  const timeout = AbortSignal.timeout(20_000);
  const res = await fetch(`${base()}/explore/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw new PublicApiError(res.status);
}
