import type {
  Crux,
  CreateCruxInput,
  UpdateCruxInput,
} from './types';

export interface ICruxService {
  findById(id: string): Promise<Crux>;
  findBySlug(slug: string): Promise<Crux>;
  listByAuthor(authorId: string): Promise<Crux[]>;
  listAll(): Promise<Crux[]>;
  listByType(type: string): Promise<Crux[]>;
  create(input: CreateCruxInput): Promise<Crux>;
  update(cruxId: string, updates: UpdateCruxInput): Promise<Crux>;
  delete(cruxId: string): Promise<void>;
}
