import { describe, it, expect, beforeEach } from 'vitest';
import { DexieAuthorService } from './author.service';
import { NotFoundError } from '../types';

describe('DexieAuthorService', () => {
  let service: DexieAuthorService;

  beforeEach(() => {
    service = new DexieAuthorService();
  });

  describe('create', () => {
    it('creates an author with generated id', async () => {
      const author = await service.create({
        username: 'testuser',
        displayName: 'Test User',
        accountId: 'account-1',
        homeId: 'home-1',
      });

      expect(author.id).toHaveLength(36);
      expect(author.username).toBe('testuser');
      expect(author.displayName).toBe('Test User');
      expect(author.accountId).toBe('account-1');
      expect(author.homeId).toBe('home-1');
      expect(author.created).toBeDefined();
      expect(author.updated).toBeDefined();
    });
  });

  describe('findById', () => {
    it('returns author by id', async () => {
      const created = await service.create({
        username: 'findme',
        displayName: 'Find Me',
        accountId: 'acc-1',
        homeId: 'home-1',
      });

      const found = await service.findById(created.id);
      expect(found.username).toBe('findme');
    });

    it('throws NotFoundError for nonexistent id', async () => {
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findByUsername', () => {
    it('returns author by username', async () => {
      await service.create({
        username: 'unique-name',
        displayName: 'Unique',
        accountId: 'acc-1',
        homeId: 'home-1',
      });

      const found = await service.findByUsername('unique-name');
      expect(found.displayName).toBe('Unique');
    });

    it('throws NotFoundError for nonexistent username', async () => {
      await expect(service.findByUsername('nobody')).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('updates displayName', async () => {
      const author = await service.create({
        username: 'updater',
        displayName: 'Original',
        accountId: 'acc-1',
        homeId: 'home-1',
      });

      const updated = await service.update(author.id, { displayName: 'Renamed' });
      expect(updated.displayName).toBe('Renamed');
      expect(updated.username).toBe('updater'); // unchanged
    });

    it('updates bio', async () => {
      const author = await service.create({
        username: 'bio-test',
        displayName: 'Bio',
        accountId: 'acc-1',
        homeId: 'home-1',
      });

      const updated = await service.update(author.id, { bio: 'Hello world' });
      expect(updated.bio).toBe('Hello world');
    });

    it('deep-merges meta', async () => {
      const author = await service.create({
        username: 'meta-test',
        displayName: 'Meta',
        accountId: 'acc-1',
        homeId: 'home-1',
      });

      const withMeta = await service.update(author.id, {
        meta: { theme: 'dark' },
      });
      expect((withMeta.meta as Record<string, unknown>)?.theme).toBe('dark');

      const merged = await service.update(author.id, {
        meta: { avatar: 'url' },
      });
      expect((merged.meta as Record<string, unknown>)?.theme).toBe('dark');
      expect((merged.meta as Record<string, unknown>)?.avatar).toBe('url');
    });

    it('throws NotFoundError for nonexistent id', async () => {
      await expect(service.update('nonexistent', { bio: 'x' })).rejects.toThrow(NotFoundError);
    });
  });
});
