import client from './client';
import type { Dimension } from './types';

export interface UpdateDimensionDto {
  kind?: string;
  weight?: number;
  note?: string;
  meta?: Record<string, unknown>;
}

export async function get(id: string): Promise<Dimension> {
  const res = await client.get<Dimension>(`/dimensions/${id}`);
  return res.data;
}

export async function update(id: string, dto: UpdateDimensionDto): Promise<Dimension> {
  const res = await client.patch<Dimension>(`/dimensions/${id}`, dto);
  return res.data;
}

export async function remove(id: string): Promise<void> {
  await client.delete(`/dimensions/${id}`);
}
