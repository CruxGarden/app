/**
 * Public API client for display mode.
 *
 * Uses plain fetch (no auth interceptors) so published cruxes
 * can be viewed without logging in.
 */

import { API_BASE_URL } from './client';
import type { Author, Crux, Artifact } from './types';

const base = API_BASE_URL;

function authorPath(username: string): string {
  const clean = username.startsWith('@') ? username.slice(1) : username;
  return `${base}/authors/${clean}`;
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

export async function getArtifacts(username: string, slug: string): Promise<Artifact[]> {
  const res = await fetch(`${authorPath(username)}/cruxes/${slug}/artifacts`);
  if (!res.ok) throw new Error(`Attachments not found (${res.status})`);
  return res.json();
}

export function getDownloadUrl(username: string, slug: string, artifactId: string): string {
  return `${authorPath(username)}/cruxes/${slug}/artifacts/${artifactId}/download`;
}

export async function downloadArtifact(
  username: string,
  slug: string,
  artifactId: string,
): Promise<Blob> {
  const res = await fetch(getDownloadUrl(username, slug, artifactId));
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

// ── Explore ───────────────────────────────────────────

export interface ExploreParams {
  q?: string;
  type?: 'cruxes' | 'authors';
  tag?: string[];
  sort?: 'recent' | 'alpha';
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
): Promise<{ items: (ExploreCrux | ExploreAuthor)[]; totalPages: number; currentPage: number }> {
  const url = new URL(`${base}/explore`);
  if (params?.q) url.searchParams.set('q', params.q);
  if (params?.type) url.searchParams.set('type', params.type);
  if (params?.sort) url.searchParams.set('sort', params.sort);
  if (params?.page) url.searchParams.set('page', String(params.page));
  if (params?.perPage) url.searchParams.set('perPage', String(params.perPage));
  if (params?.tag) {
    for (const t of params.tag) url.searchParams.append('tag', t);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Explore failed (${res.status})`);
  const items = await res.json();
  const pagination = JSON.parse(res.headers.get('Pagination') || '{}');
  return {
    items,
    totalPages: pagination.lastPage || 1,
    currentPage: pagination.currentPage || 1,
  };
}

export async function exploreTags(limit?: number): Promise<ExploreTag[]> {
  const url = new URL(`${base}/explore/tags`);
  if (limit) url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Tags failed (${res.status})`);
  const body = await res.json();
  return body.data;
}
