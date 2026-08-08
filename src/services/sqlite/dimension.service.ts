import type { IDimensionService } from '../dimension.service';
import type {
  Dimension,
  DimensionType,
  CreateDimensionInput,
  UpdateDimensionInput,
} from '../types';
import { NotFoundError } from '../types';
import { getSqliteClient } from './client';
import { getLocalIdentity } from './identity';
import { fromRow, buildInsert, buildUpdate } from './helpers';

export class SqliteDimensionService implements IDimensionService {
  async findById(id: string): Promise<Dimension> {
    const row = await getSqliteClient().get('SELECT * FROM dimensions WHERE id = ?', [id]);
    if (!row) throw new NotFoundError('Dimension not found');
    return fromRow<Dimension>(row);
  }

  async findBySourceAndType(sourceId: string, type?: DimensionType): Promise<Dimension[]> {
    const db = getSqliteClient();
    let rows: Record<string, unknown>[];
    if (type) {
      rows = await db.all('SELECT * FROM dimensions WHERE source_id = ? AND type = ?', [
        sourceId,
        type,
      ]);
    } else {
      rows = await db.all('SELECT * FROM dimensions WHERE source_id = ?', [sourceId]);
    }
    return rows.map((r) => fromRow<Dimension>(r));
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
    const { sql, params } = buildInsert('dimensions', { ...dim });
    await getSqliteClient().run(sql, params);
    return dim;
  }

  async update(id: string, updates: UpdateDimensionInput): Promise<Dimension> {
    const changes: Record<string, unknown> = { updated: new Date().toISOString() };
    if (updates.kind !== undefined) changes.kind = updates.kind;
    if (updates.weight !== undefined) changes.weight = updates.weight;
    if (updates.note !== undefined) changes.note = updates.note;
    if (updates.meta !== undefined) {
      const existing = await this.findById(id);
      changes.meta = { ...existing.meta, ...updates.meta };
    }
    const { sql, params } = buildUpdate('dimensions', id, changes);
    await getSqliteClient().run(sql, params);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await getSqliteClient().run('DELETE FROM dimensions WHERE id = ?', [id]);
  }
}
