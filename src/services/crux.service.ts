import type { Crux, CreateCruxInput, UpdateCruxInput } from './types';

export interface ICruxService {
  findById(id: string): Promise<Crux>;
  findBySlug(slug: string): Promise<Crux>;
  listByAuthor(authorId: string): Promise<Crux[]>;
  listAll(): Promise<Crux[]>;
  listByType(type: string): Promise<Crux[]>;
  create(input: CreateCruxInput): Promise<Crux>;
  update(cruxId: string, updates: UpdateCruxInput): Promise<Crux>;
  /** Permanently remove a crux and its rows. Prefer `trash` from the UI. */
  delete(cruxId: string): Promise<void>;
  /** Move a crux to the Trash: hidden from every list, restorable until purged. */
  trash(cruxId: string): Promise<void>;
  /** Bring a trashed crux back. */
  restore(cruxId: string): Promise<void>;
  /** Cruxes in the Trash, most recently deleted first. */
  listTrashed(): Promise<Crux[]>;
  /** Permanently delete cruxes trashed longer than `olderThanMs` ago. Returns how many. */
  purgeTrash(olderThanMs: number): Promise<number>;
}
