import type { Author, CreateAuthorInput, UpdateAuthorInput } from './types';

export interface IAuthorService {
  findById(id: string): Promise<Author>;
  findByUsername(username: string): Promise<Author>;
  create(input: CreateAuthorInput): Promise<Author>;
  update(id: string, updates: UpdateAuthorInput): Promise<Author>;
}
