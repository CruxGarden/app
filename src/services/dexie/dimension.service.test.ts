import { describe, it, expect, beforeEach } from 'vitest';
import { DexieDimensionService } from './dimension.service';
import { NotFoundError } from '../types';

describe('DexieDimensionService', () => {
  let service: DexieDimensionService;

  beforeEach(() => {
    service = new DexieDimensionService();
  });

  describe('create', () => {
    it('creates a dimension with generated id', async () => {
      const dim = await service.create({
        sourceId: 'crux-1',
        targetId: 'crux-1',
        type: 'growth',
      });

      expect(dim.id).toHaveLength(36);
      expect(dim.sourceId).toBe('crux-1');
      expect(dim.targetId).toBe('crux-1');
      expect(dim.type).toBe('growth');
      expect(dim.homeId).toBeDefined();
      expect(dim.created).toBeDefined();
      expect(dim.updated).toBeDefined();
    });

    it('accepts optional fields', async () => {
      const dim = await service.create({
        sourceId: 'a',
        targetId: 'b',
        type: 'gate',
        kind: 'snapshot',
        weight: 5,
        note: 'test note',
        meta: { versionIds: ['v1'] },
      });

      expect(dim.kind).toBe('snapshot');
      expect(dim.weight).toBe(5);
      expect(dim.note).toBe('test note');
      expect((dim.meta as Record<string, unknown>)?.versionIds).toEqual(['v1']);
    });
  });

  describe('findById', () => {
    it('returns dimension by id', async () => {
      const created = await service.create({
        sourceId: 'a',
        targetId: 'b',
        type: 'gate',
      });

      const found = await service.findById(created.id);
      expect(found.id).toBe(created.id);
      expect(found.type).toBe('gate');
    });

    it('throws NotFoundError for nonexistent id', async () => {
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findBySourceAndType', () => {
    it('returns all dimensions for a source', async () => {
      await service.create({ sourceId: 'crux-1', targetId: 'crux-1', type: 'growth' });
      await service.create({ sourceId: 'crux-1', targetId: 'crux-2', type: 'gate' });
      await service.create({ sourceId: 'crux-2', targetId: 'crux-1', type: 'growth' });

      const all = await service.findBySourceAndType('crux-1');
      expect(all).toHaveLength(2);
    });

    it('filters by type when provided', async () => {
      await service.create({ sourceId: 'crux-1', targetId: 'crux-1', type: 'growth' });
      await service.create({ sourceId: 'crux-1', targetId: 'crux-1', type: 'growth' });
      await service.create({ sourceId: 'crux-1', targetId: 'crux-2', type: 'gate' });

      const growths = await service.findBySourceAndType('crux-1', 'growth');
      expect(growths).toHaveLength(2);
      expect(growths.every((d) => d.type === 'growth')).toBe(true);

      const gates = await service.findBySourceAndType('crux-1', 'gate');
      expect(gates).toHaveLength(1);
    });

    it('returns empty array when no matches', async () => {
      const result = await service.findBySourceAndType('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates fields and timestamp', async () => {
      const dim = await service.create({
        sourceId: 'a',
        targetId: 'b',
        type: 'gate',
        weight: 1,
      });

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 5));
      const updated = await service.update(dim.id, { weight: 10, note: 'updated' });
      expect(updated.weight).toBe(10);
      expect(updated.note).toBe('updated');
      expect(updated.updated).not.toBe(dim.updated);
    });

    it('throws NotFoundError for nonexistent id', async () => {
      await expect(service.update('nonexistent', { weight: 1 })).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('removes the dimension', async () => {
      const dim = await service.create({
        sourceId: 'a',
        targetId: 'b',
        type: 'gate',
      });

      await service.delete(dim.id);
      await expect(service.findById(dim.id)).rejects.toThrow(NotFoundError);
    });
  });
});
