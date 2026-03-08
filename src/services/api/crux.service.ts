import type { ICruxService } from '../crux.service';
import type { Crux, CreateCruxInput, UpdateCruxInput } from '../types';
import { NotFoundError } from '../types';
import * as cruxes from '@/api/cruxes';

const PAGE_SIZE = 50;

export class ApiCruxService implements ICruxService {
  async findById(id: string): Promise<Crux> {
    try {
      return await cruxes.get(id);
    } catch {
      throw new NotFoundError('Crux not found');
    }
  }

  async findBySlug(slug: string): Promise<Crux> {
    try {
      return await cruxes.get(slug);
    } catch {
      throw new NotFoundError('Crux not found');
    }
  }

  async listByAuthor(_authorId: string): Promise<Crux[]> {
    // The API scopes to the authenticated user automatically.
    return this.fetchAllPages();
  }

  async listAll(): Promise<Crux[]> {
    return this.fetchAllPages();
  }

  async create(input: CreateCruxInput): Promise<Crux> {
    return cruxes.create({
      slug: input.slug || crypto.randomUUID().slice(0, 8),
      title: input.title,
      description: input.description,
      data: input.data || '',
      type: input.type,
      kind: input.kind,
      meta: input.meta,
    });
  }

  async update(cruxId: string, updates: UpdateCruxInput): Promise<Crux> {
    return cruxes.update(cruxId, {
      title: updates.title,
      slug: updates.slug,
      description: updates.description,
      data: updates.data,
      type: updates.type,
      kind: updates.kind,
      status: updates.status,
      visibility: updates.visibility,
      meta: updates.meta,
    });
  }

  async delete(cruxId: string): Promise<void> {
    return cruxes.remove(cruxId);
  }

  private async fetchAllPages(): Promise<Crux[]> {
    const all: Crux[] = [];
    let offset = 0;

    while (true) {
      const result = await cruxes.list({ limit: PAGE_SIZE, offset });
      all.push(...result.data);

      if (result.data.length < PAGE_SIZE || all.length >= result.meta.total) {
        break;
      }
      offset += PAGE_SIZE;
    }

    return all;
  }
}
