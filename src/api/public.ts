/**
 * Public API client for display mode.
 *
 * Uses plain fetch (no auth interceptors) so published cruxes
 * can be viewed without logging in.
 */

import { API_BASE_URL } from './client';
import type { Author, Crux, Attachment } from './types';

const base = API_BASE_URL;

function authorPath(username: string): string {
  const id = username.startsWith('@') ? username : `@${username}`;
  return `${base}/authors/${id}`;
}

export async function getAuthor(username: string): Promise<Author> {
  const res = await fetch(`${authorPath(username)}`);
  if (!res.ok) throw new Error(`Author not found (${res.status})`);
  return res.json();
}

export async function getAuthorCruxes(
  username: string,
  params?: { page?: number; perPage?: number },
): Promise<{ cruxes: Crux[]; totalPages: number; currentPage: number }> {
  const url = new URL(`${authorPath(username)}/cruxes`);
  if (params?.page) url.searchParams.set('page', String(params.page));
  if (params?.perPage) url.searchParams.set('perPage', String(params.perPage));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to load cruxes (${res.status})`);
  const cruxes = await res.json();
  const pagination = JSON.parse(res.headers.get('Pagination') || '{}');
  return {
    cruxes,
    totalPages: pagination.lastPage || 1,
    currentPage: pagination.currentPage || 1,
  };
}

export async function getCruxBySlug(username: string, slug: string): Promise<Crux> {
  const res = await fetch(`${authorPath(username)}/cruxes/${slug}`);
  if (!res.ok) throw new Error(`Crux not found (${res.status})`);
  return res.json();
}

export async function getAttachments(username: string, slug: string): Promise<Attachment[]> {
  const res = await fetch(`${authorPath(username)}/cruxes/${slug}/attachments`);
  if (!res.ok) throw new Error(`Attachments not found (${res.status})`);
  return res.json();
}

export function getDownloadUrl(username: string, slug: string, attachmentId: string): string {
  return `${authorPath(username)}/cruxes/${slug}/attachments/${attachmentId}/download`;
}

export async function downloadAttachment(
  username: string,
  slug: string,
  attachmentId: string,
): Promise<Blob> {
  const res = await fetch(getDownloadUrl(username, slug, attachmentId));
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}
