import type { ICruxService } from '../crux.service';
import type { Crux, CreateCruxInput, UpdateCruxInput } from '../types';
import { NotFoundError } from '../types';
import { db } from './schema';
import { getLocalIdentity } from './identity';
import { generateSlug } from './helpers';

export class DexieCruxService implements ICruxService {
  async findById(id: string): Promise<Crux> {
    const row = await db.cruxes.get(id);
    if (!row) throw new NotFoundError('Crux not found');
    return row;
  }

  async findBySlug(slug: string): Promise<Crux> {
    const row = await db.cruxes.where('slug').equals(slug).first();
    if (!row) throw new NotFoundError('Crux not found');
    return row;
  }

  async listByAuthor(authorId: string): Promise<Crux[]> {
    return db.cruxes.where('authorId').equals(authorId).reverse().sortBy('updated');
  }

  async listAll(): Promise<Crux[]> {
    return db.cruxes.reverse().sortBy('updated');
  }

  async create(input: CreateCruxInput): Promise<Crux> {
    const identity = await getLocalIdentity();
    const now = new Date().toISOString();
    const crux: Crux = {
      id: crypto.randomUUID(),
      slug: input.slug || generateSlug(input.title),
      title: input.title || '',
      description: input.description || '',
      data: input.data || '',
      type: input.type || 'crux',
      kind: input.kind,
      status: 'living',
      visibility: 'private',
      authorId: input.authorId || identity.authorId,
      homeId: input.homeId || identity.homeId,
      meta: input.meta || {},
      created: now,
      updated: now,
    };
    await db.cruxes.add(crux);
    return crux;
  }

  async update(cruxId: string, updates: UpdateCruxInput): Promise<Crux> {
    const existing = await this.findById(cruxId);
    // Build changes object with only defined fields
    const changes: Record<string, unknown> = { updated: new Date().toISOString() };
    if (updates.title !== undefined) changes.title = updates.title;
    if (updates.slug !== undefined) changes.slug = updates.slug;
    if (updates.description !== undefined) changes.description = updates.description;
    if (updates.data !== undefined) changes.data = updates.data;
    if (updates.type !== undefined) changes.type = updates.type;
    if (updates.kind !== undefined) changes.kind = updates.kind;
    if (updates.status !== undefined) changes.status = updates.status;
    if (updates.visibility !== undefined) changes.visibility = updates.visibility;
    if (updates.meta !== undefined) changes.meta = { ...existing.meta, ...updates.meta };
    await db.cruxes.update(cruxId, changes);
    return this.findById(cruxId);
  }

  async delete(cruxId: string): Promise<void> {
    await db.transaction('rw', [db.cruxes, db.artifacts, db.dimensions], async () => {
      await db.artifacts.where('resourceId').equals(cruxId).delete();
      await db.dimensions.where('sourceId').equals(cruxId).delete();
      await db.dimensions.where('targetId').equals(cruxId).delete();
      await db.cruxes.delete(cruxId);
    });
  }
}
