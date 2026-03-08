import type { IAuthorService } from '../author.service';
import type { Author, CreateAuthorInput, UpdateAuthorInput } from '../types';
import { NotFoundError } from '../types';
import { db } from './schema';

export class DexieAuthorService implements IAuthorService {
  async findById(id: string): Promise<Author> {
    const row = await db.authors.get(id);
    if (!row) throw new NotFoundError('Author not found');
    return row;
  }

  async findByUsername(username: string): Promise<Author> {
    const row = await db.authors.where('username').equals(username).first();
    if (!row) throw new NotFoundError('Author not found');
    return row;
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
    await db.authors.add(author);
    return author;
  }

  async update(id: string, updates: UpdateAuthorInput): Promise<Author> {
    const existing = await this.findById(id);
    const changes: Record<string, unknown> = { updated: new Date().toISOString() };
    if (updates.username !== undefined) changes.username = updates.username;
    if (updates.displayName !== undefined) changes.displayName = updates.displayName;
    if (updates.bio !== undefined) changes.bio = updates.bio;
    if (updates.meta !== undefined) changes.meta = { ...existing.meta, ...updates.meta };
    await db.authors.update(id, changes);
    return this.findById(id);
  }
}
