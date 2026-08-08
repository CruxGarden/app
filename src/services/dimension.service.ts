import type { Dimension, DimensionType, CreateDimensionInput, UpdateDimensionInput } from './types';

export interface IDimensionService {
  findById(id: string): Promise<Dimension>;
  findBySourceAndType(sourceId: string, type?: DimensionType): Promise<Dimension[]>;
  create(input: CreateDimensionInput): Promise<Dimension>;
  update(id: string, updates: UpdateDimensionInput): Promise<Dimension>;
  delete(id: string): Promise<void>;
}
