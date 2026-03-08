import type { IAuthorService } from '../author.service';
import type { Author, CreateAuthorInput, UpdateAuthorInput } from '../types';
import { NotFoundError } from '../types';
import * as authors from '@/api/authors';

export class ApiAuthorService implements IAuthorService {
  async findById(id: string): Promise<Author> {
    try {
      return await authors.get(id);
    } catch {
      throw new NotFoundError('Author not found');
    }
  }

  async findByUsername(username: string): Promise<Author> {
    try {
      return await authors.get(username);
    } catch {
      throw new NotFoundError('Author not found');
    }
  }

  async create(input: CreateAuthorInput): Promise<Author> {
    return authors.create({
      username: input.username,
      displayName: input.displayName,
    });
  }

  async update(id: string, updates: UpdateAuthorInput): Promise<Author> {
    return authors.update(id, {
      displayName: updates.displayName,
      bio: updates.bio,
    });
  }
}
