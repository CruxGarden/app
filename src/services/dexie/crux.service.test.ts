import { describe, it, expect, beforeEach } from 'vitest';
import { DexieCruxService } from './crux.service';
import { DexieAttachmentService } from './attachment.service';
import { DexieDimensionService } from './dimension.service';
import { NotFoundError } from '../types';
import { db } from './schema';

describe('DexieCruxService', () => {
  let service: DexieCruxService;

  beforeEach(() => {
    service = new DexieCruxService();
  });

  describe('create', () => {
    it('creates a crux with generated id and slug', async () => {
      const crux = await service.create({ title: 'My First Crux' });

      expect(crux.id).toBeDefined();
      expect(crux.id).toHaveLength(36); // UUID
      expect(crux.slug).toBe('my-first-crux');
      expect(crux.title).toBe('My First Crux');
      expect(crux.status).toBe('living');
      expect(crux.visibility).toBe('private');
      expect(crux.data).toBe('');
      expect(crux.authorId).toBeDefined();
      expect(crux.homeId).toBeDefined();
      expect(crux.created).toBeDefined();
      expect(crux.updated).toBeDefined();
    });

    it('uses provided slug when given', async () => {
      const crux = await service.create({ title: 'Test', slug: 'custom-slug' });
      expect(crux.slug).toBe('custom-slug');
    });

    it('generates slug from title', async () => {
      const crux = await service.create({ title: 'Hello World!' });
      expect(crux.slug).toBe('hello-world');
    });

    it('generates random slug when no title', async () => {
      const crux = await service.create({});
      expect(crux.slug).toHaveLength(8);
    });

    it('stores crux in IndexedDB', async () => {
      const crux = await service.create({ title: 'Stored' });
      const row = await db.cruxes.get(crux.id);
      expect(row).toBeDefined();
      expect(row?.title).toBe('Stored');
    });

    it('sets default type to crux', async () => {
      const crux = await service.create({});
      expect(crux.type).toBe('crux');
    });

    it('accepts optional kind', async () => {
      const crux = await service.create({ kind: 'webapp' });
      expect(crux.kind).toBe('webapp');
    });

    it('uses provided authorId/homeId over local identity', async () => {
      const crux = await service.create({
        authorId: 'custom-author',
        homeId: 'custom-home',
      });
      expect(crux.authorId).toBe('custom-author');
      expect(crux.homeId).toBe('custom-home');
    });
  });

  describe('findById', () => {
    it('returns the crux by id', async () => {
      const created = await service.create({ title: 'Find Me' });
      const found = await service.findById(created.id);
      expect(found.title).toBe('Find Me');
      expect(found.id).toBe(created.id);
    });

    it('throws NotFoundError for nonexistent id', async () => {
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findBySlug', () => {
    it('returns the crux by slug', async () => {
      await service.create({ title: 'Sluggy' });
      const found = await service.findBySlug('sluggy');
      expect(found.title).toBe('Sluggy');
    });

    it('throws NotFoundError for nonexistent slug', async () => {
      await expect(service.findBySlug('no-such-slug')).rejects.toThrow(NotFoundError);
    });
  });

  describe('listAll', () => {
    it('returns empty array when no cruxes', async () => {
      const list = await service.listAll();
      expect(list).toEqual([]);
    });

    it('returns all cruxes sorted by updated (newest first)', async () => {
      const a = await service.create({ title: 'First' });
      // Update b and c with staggered timestamps so sort order is deterministic
      const b = await service.create({ title: 'Second' });
      await service.update(b.id, { description: 'bump' });
      const c = await service.create({ title: 'Third' });
      await service.update(c.id, { description: 'bump' });
      // c was updated last, then b, then a
      const bUpdated = await service.findById(b.id);
      const cUpdated = await service.findById(c.id);

      const list = await service.listAll();
      expect(list).toHaveLength(3);
      // Most recently updated should be first
      expect(list[0]!.id).toBe(cUpdated.id);
      expect(list[1]!.id).toBe(bUpdated.id);
      expect(list[2]!.id).toBe(a.id);
    });
  });

  describe('listByAuthor', () => {
    it('filters by authorId', async () => {
      await service.create({ title: 'Mine', authorId: 'author-a' });
      await service.create({ title: 'Theirs', authorId: 'author-b' });
      await service.create({ title: 'Also Mine', authorId: 'author-a' });

      const list = await service.listByAuthor('author-a');
      expect(list).toHaveLength(2);
      expect(list.every((c) => c.authorId === 'author-a')).toBe(true);
    });
  });

  describe('update', () => {
    it('updates title and sets updated timestamp', async () => {
      const crux = await service.create({ title: 'Original' });
      const updated = await service.update(crux.id, { title: 'Renamed' });

      expect(updated.title).toBe('Renamed');
      expect(updated.updated).not.toBe(crux.updated);
    });

    it('deep-merges meta without overwriting existing keys', async () => {
      const crux = await service.create({
        meta: { settings: { model: 'claude' }, summary: { crux: 'test' } } as Record<string, unknown>,
      });
      const updated = await service.update(crux.id, {
        meta: { settings: { palette: { bg: '#000' } } } as Record<string, unknown>,
      });

      // Both the original and new meta keys should exist
      expect((updated.meta as Record<string, unknown>)?.settings).toBeDefined();
      expect((updated.meta as Record<string, unknown>)?.summary).toBeDefined();
    });

    it('preserves fields not included in updates', async () => {
      const crux = await service.create({ title: 'Keep', description: 'This' });
      const updated = await service.update(crux.id, { title: 'Changed' });

      expect(updated.title).toBe('Changed');
      expect(updated.description).toBe('This'); // preserved
    });

    it('throws NotFoundError for nonexistent id', async () => {
      await expect(service.update('nonexistent', { title: 'x' })).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('removes the crux from IndexedDB', async () => {
      const crux = await service.create({ title: 'Delete Me' });
      await service.delete(crux.id);

      await expect(service.findById(crux.id)).rejects.toThrow(NotFoundError);
    });

    it('cascades deletion to artifacts and dimensions', async () => {
      const crux = await service.create({ title: 'Cascade' });

      // Create an artifact for this crux
      const attachmentService = new DexieAttachmentService();
      await attachmentService.create({
        resourceId: crux.id,
        content: 'test',
        meta: { path: 'test.txt' },
      });

      // Create a dimension for this crux
      const dimensionService = new DexieDimensionService();
      await dimensionService.create({
        sourceId: crux.id,
        targetId: crux.id,
        type: 'growth',
      });

      // Verify they exist
      expect(await attachmentService.findByResource('crux', crux.id)).toHaveLength(1);
      expect(await dimensionService.findBySourceAndType(crux.id)).toHaveLength(1);

      // Delete the crux
      await service.delete(crux.id);

      // Artifacts and dimensions should be gone
      expect(await attachmentService.findByResource('crux', crux.id)).toHaveLength(0);
      expect(await dimensionService.findBySourceAndType(crux.id)).toHaveLength(0);
    });
  });
});
