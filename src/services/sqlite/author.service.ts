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

  async create(input: CreateAuthorInput): Promise<Author> {
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
