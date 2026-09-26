import type { IAuthorService } from '../author.service';
import type { Author, CreateAuthorInput, UpdateAuthorInput } from '../types';
import { NotFoundError } from '../types';
import { getSqliteClient } from './client';
import { fromRow, buildInsert, buildUpdate } from './helpers';

export class SqliteAuthorService implements IAuthorService {
  async findById(id: string): Promise<Author> {
    const row = await getSqliteClient().get('SELECT * FROM authors WHERE id = ?', [id]);
    if (!row) throw new NotFoundError('Author not found');
    return fromRow<Author>(row);
  }

  async findByUsername(username: string): Promise<Author> {
    const row = await getSqliteClient().get('SELECT * FROM authors WHERE username = ?', [username]);
    if (!row) throw new NotFoundError('Author not found');
    return fromRow<Author>(row);
  }

  /** Create an author; `local` also records it as this installation's author (desktop, atomically). */
  async create(input: CreateAuthorInput & { local?: boolean }): Promise<Author> {
    const db = getSqliteClient();
    if (db.installation) {
      const row = await db.installation.createAuthor({
        username: input.username,
        displayName: input.displayName ?? null,
        accountId: input.accountId ?? null,
        homeId: input.homeId ?? null,
        local: !!input.local,
      });
      return fromRow<Author>(row as unknown as Record<string, unknown>);
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const author: Author = {
      id,
      username: input.username,
      displayName: input.displayName,
      accountId: input.accountId ?? `local-${id}`,
      homeId: input.homeId ?? `home-${id}`,
      created: now,
      updated: now,
    };
    const { sql, params } = buildInsert('authors', { ...author });
    await getSqliteClient().run(sql, params);
    return author;
  }

  async update(id: string, updates: UpdateAuthorInput): Promise<Author> {
    const db = getSqliteClient();
    if (db.installation) {
      await db.installation.updateAuthor(id, {
        ...(updates.username !== undefined ? { username: updates.username } : {}),
        ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
        ...(updates.bio !== undefined ? { bio: updates.bio } : {}),
        ...(updates.meta !== undefined ? { meta: updates.meta } : {}),
      });
      return this.findById(id);
    }
    const existing = await this.findById(id);
    const changes: Record<string, unknown> = { updated: new Date().toISOString() };
    if (updates.username !== undefined) changes.username = updates.username;
    if (updates.displayName !== undefined) changes.displayName = updates.displayName;
    if (updates.bio !== undefined) changes.bio = updates.bio;
    if (updates.meta !== undefined) changes.meta = { ...existing.meta, ...updates.meta };
    const { sql, params } = buildUpdate('authors', id, changes);
    await getSqliteClient().run(sql, params);
    return this.findById(id);
  }
}
