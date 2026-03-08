import type { IDimensionService } from '../dimension.service';
import type { Dimension, DimensionType, CreateDimensionInput, UpdateDimensionInput } from '../types';
import { NotFoundError } from '../types';
import { db } from './schema';
import { getLocalIdentity } from './identity';

export class DexieDimensionService implements IDimensionService {
  async findById(id: string): Promise<Dimension> {
    const row = await db.dimensions.get(id);
    if (!row) throw new NotFoundError('Dimension not found');
    return row;
  }

  async findBySourceAndType(sourceId: string, type?: DimensionType): Promise<Dimension[]> {
    if (type) {
      return db.dimensions.where('[sourceId+type]').equals([sourceId, type]).toArray();
    }
    return db.dimensions.where('sourceId').equals(sourceId).toArray();
  }

  async create(input: CreateDimensionInput): Promise<Dimension> {
    const identity = await getLocalIdentity();
    const now = new Date().toISOString();
    const dim: Dimension = {
      id: crypto.randomUUID(),
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
      kind: input.kind,
      weight: input.weight,
      homeId: identity.homeId,
      note: input.note,
      meta: input.meta || {},
      created: now,
      updated: now,
    };
    await db.dimensions.add(dim);
    return dim;
  }

  async update(id: string, updates: UpdateDimensionInput): Promise<Dimension> {
    await db.dimensions.update(id, { ...updates, updated: new Date().toISOString() });
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await db.dimensions.delete(id);
  }
}
