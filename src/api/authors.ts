import client from './client';
import type { Author, CreateAuthorDto, UpdateAuthorDto, Crux } from './types';

export async function list(): Promise<Author[]> {
  const res = await client.get<Author[]>('/authors');
  return res.data;
}

export async function get(identifier: string, embed?: 'root'): Promise<Author> {
  const id = identifier.startsWith('@') ? identifier : `@${identifier}`;
  const params = embed ? { embed } : {};
  const res = await client.get<Author>(`/authors/${id}`, { params });
  return res.data;
}

export async function create(dto: CreateAuthorDto): Promise<Author> {
  const res = await client.post<Author>('/authors', dto);
  return res.data;
}

export async function update(id: string, dto: UpdateAuthorDto): Promise<Author> {
  const res = await client.patch<Author>(`/authors/${id}`, dto);
  return res.data;
}

export async function getCruxBySlug(username: string, slug: string): Promise<Crux> {
  const id = username.startsWith('@') ? username : `@${username}`;
  const res = await client.get<Crux>(`/authors/${id}/cruxes/${slug}`);
  return res.data;
}

export async function uploadAvatar(authorId: string, file: File): Promise<Author> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await client.post<Author>(`/authors/${authorId}/avatar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function removeAvatar(authorId: string): Promise<Author> {
  const res = await client.delete<Author>(`/authors/${authorId}/avatar`);
  return res.data;
}

export async function checkUsername(username: string): Promise<{ available: boolean }> {
  const res = await client.get<{ available: boolean }>('/authors/check-username', {
    params: { username },
  });
  return res.data;
}
