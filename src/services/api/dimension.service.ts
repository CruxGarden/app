import type { IDimensionService } from '../dimension.service';
import type { Dimension, DimensionType, CreateDimensionInput, UpdateDimensionInput } from '../types';
import * as cruxes from '@/api/cruxes';
import * as dimensionsApi from '@/api/dimensions';

export class ApiDimensionService implements IDimensionService {
  async findById(id: string): Promise<Dimension> {
    return dimensionsApi.get(id);
  }

  async findBySourceAndType(sourceId: string, type?: DimensionType): Promise<Dimension[]> {
    return cruxes.getDimensions(sourceId, type);
  }

  async create(input: CreateDimensionInput): Promise<Dimension> {
    return cruxes.createDimension(input.sourceId, {
      targetId: input.targetId,
      type: input.type,
      weight: input.weight,
      note: input.note,
    });
  }

  async update(id: string, updates: UpdateDimensionInput): Promise<Dimension> {
    return dimensionsApi.update(id, {
      kind: updates.kind,
      weight: updates.weight,
      note: updates.note,
      meta: updates.meta,
    });
  }

  async delete(id: string): Promise<void> {
    return dimensionsApi.remove(id);
  }
}
