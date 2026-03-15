import type { ICruxService } from '../crux.service';
import type { Crux, CreateCruxInput, UpdateCruxInput } from '../types';
import { NotFoundError } from '../types';
import { getSqliteClient } from './client';
import { getLocalIdentity } from './identity';
import { fromRow, buildInsert, buildUpdate, generateSlug } from './helpers';

export class SqliteCruxService implements ICruxService {
  async findById(id: string): Promise<Crux> {
    const row = await getSqliteClient().get('SELECT * FROM cruxes WHERE id = ?', [id]);
    if (!row) throw new NotFoundError('Crux not found');
    return fromRow<Crux>(row);
  }

  async findBySlug(slug: string): Promise<Crux> {
    const row = await getSqliteClient().get('SELECT * FROM cruxes WHERE slug = ?', [slug]);
    if (!row) throw new NotFoundError('Crux not found');
    return fromRow<Crux>(row);
  }

  async listByAuthor(authorId: string): Promise<Crux[]> {
    const rows = await getSqliteClient().all(
      'SELECT * FROM cruxes WHERE author_id = ? ORDER BY updated DESC',
      [authorId],
    );
    return rows.map((r) => fromRow<Crux>(r));
  }

  async listAll(): Promise<Crux[]> {
    const rows = await getSqliteClient().all(
      "SELECT * FROM cruxes WHERE (kind IS NULL OR kind != 'snapshot') AND type != 'mood' ORDER BY updated DESC",
    );
    return rows.map((r) => fromRow<Crux>(r));
  }

  async listByType(type: string): Promise<Crux[]> {
    const rows = await getSqliteClient().all(
      "SELECT * FROM cruxes WHERE type = ? AND (kind IS NULL OR kind != 'snapshot') ORDER BY updated DESC",
      [type],
    );
    return rows.map((r) => fromRow<Crux>(r));
  }

  async create(input: CreateCruxInput): Promise<Crux> {
    const identity = await getLocalIdentity();
    const now = new Date().toISOString();
    const crux: Crux = {
      id: input.id || crypto.randomUUID(),
      slug: input.slug || generateSlug(input.title),
      title: input.title || '',
      description: input.description || '',
      data: input.data || '',
      type: input.type || 'crux',
      kind: input.kind,
      status: 'living',
      visibility: 'private',
      discoverable: false,
      authorId: input.authorId || identity.authorId,
      homeId: input.homeId || identity.homeId,
      meta: input.meta || {},
      created: now,
      updated: now,
    };
    const { sql, params } = buildInsert('cruxes', { ...crux });
    await getSqliteClient().run(sql, params);
    return crux;
  }

  async update(cruxId: string, updates: UpdateCruxInput): Promise<Crux> {
    const existing = await this.findById(cruxId);
    const changes: Record<string, unknown> = { updated: new Date().toISOString() };
    if (updates.title !== undefined) changes.title = updates.title;
    if (updates.slug !== undefined) changes.slug = updates.slug;
    if (updates.description !== undefined) changes.description = updates.description;
    if (updates.data !== undefined) changes.data = updates.data;
    if (updates.type !== undefined) changes.type = updates.type;
    if (updates.kind !== undefined) changes.kind = updates.kind;
    if (updates.status !== undefined) changes.status = updates.status;
    if (updates.visibility !== undefined) changes.visibility = updates.visibility;
    if (updates.discoverable !== undefined) changes.discoverable = updates.discoverable;
    if (updates.remoteId !== undefined) changes.remoteId = updates.remoteId;
    if (updates.meta !== undefined) changes.meta = { ...existing.meta, ...updates.meta };

    const { sql, params } = buildUpdate('cruxes', cruxId, changes);
    await getSqliteClient().run(sql, params);
    return this.findById(cruxId);
  }

  async delete(cruxId: string): Promise<void> {
    const db = getSqliteClient();
    await db.run('DELETE FROM artifacts WHERE resource_id = ?', [cruxId]);
    await db.run('DELETE FROM dimensions WHERE source_id = ? OR target_id = ?', [cruxId, cruxId]);
    await db.run('DELETE FROM cruxes WHERE id = ?', [cruxId]);
  }
}
