import { describe, it, expect, beforeEach } from 'vitest';
import { DexieAttachmentService } from './attachment.service';
import { NotFoundError } from '../types';
import { db } from './schema';

describe('DexieAttachmentService', () => {
  let service: DexieAttachmentService;
  const cruxId = 'test-crux-id';

  beforeEach(() => {
    service = new DexieAttachmentService();
  });

  describe('create (text content)', () => {
    it('creates an attachment with correct fields', async () => {
      const attachment = await service.create({
        resourceId: cruxId,
        content: '<h1>Hello</h1>',
        meta: { path: 'index.html' },
      });

      expect(attachment.id).toHaveLength(36);
      expect(attachment.type).toBe('artifact');
      expect(attachment.kind).toBe('file');
      expect(attachment.resourceId).toBe(cruxId);
      expect(attachment.resourceType).toBe('crux');
      expect(attachment.encoding).toBe('utf-8');
      expect(attachment.mimeType).toBe('text/html');
      expect(attachment.filename).toBe('index.html');
      expect(attachment.size).toBe(14);
      expect(attachment.meta?.path).toBe('index.html');
    });

    it('does not include Dexie-internal fields on returned attachment', async () => {
      const attachment = await service.create({
        resourceId: cruxId,
        content: 'test',
        meta: { path: 'test.txt' },
      });

      expect('content' in attachment).toBe(false);
      expect('path' in attachment).toBe(false);
      expect('fingerprint' in attachment).toBe(false);
    });

    it('stores content in IndexedDB', async () => {
      const attachment = await service.create({
        resourceId: cruxId,
        content: 'stored content',
        meta: { path: 'file.txt' },
      });

      const row = await db.artifacts.get(attachment.id);
      expect(row?.content).toBe('stored content');
    });

    it('computes fingerprint on create', async () => {
      await service.create({
        resourceId: cruxId,
        content: 'hello',
        meta: { path: 'hello.txt' },
      });

      const rows = await db.artifacts.toArray();
      expect(rows[0]?.fingerprint).toHaveLength(64);
      expect(rows[0]?.fingerprint).toMatch(/^[0-9a-f]+$/);
    });

    it('auto-detects MIME type from path', async () => {
      const css = await service.create({
        resourceId: cruxId,
        content: 'body {}',
        meta: { path: 'styles/main.css' },
      });
      expect(css.mimeType).toBe('text/css');

      const js = await service.create({
        resourceId: cruxId,
        content: 'console.log()',
        meta: { path: 'app.js' },
      });
      expect(js.mimeType).toBe('application/javascript');
    });

    it('uses provided mimeType over auto-detection', async () => {
      const attachment = await service.create({
        resourceId: cruxId,
        content: 'custom',
        mimeType: 'application/custom',
        meta: { path: 'file.txt' },
      });
      expect(attachment.mimeType).toBe('application/custom');
    });
  });

  describe('path-based dedup (overwrite in place)', () => {
    it('overwrites existing artifact at the same path', async () => {
      const first = await service.create({
        resourceId: cruxId,
        content: 'version 1',
        meta: { path: 'index.html' },
      });

      const second = await service.create({
        resourceId: cruxId,
        content: 'version 2',
        meta: { path: 'index.html' },
      });

      // Same ID — overwritten in place
      expect(second.id).toBe(first.id);
      expect(second.size).toBe('version 2'.length);

      // Only one row in the database
      const all = await service.findByResource('crux', cruxId);
      expect(all).toHaveLength(1);

      // Content is the new version
      const content = await service.readContent(second.id);
      expect(content).toBe('version 2');
    });

    it('does not overwrite artifacts in different cruxes at the same path', async () => {
      await service.create({
        resourceId: 'crux-a',
        content: 'from A',
        meta: { path: 'index.html' },
      });

      await service.create({
        resourceId: 'crux-b',
        content: 'from B',
        meta: { path: 'index.html' },
      });

      const aFiles = await service.findByResource('crux', 'crux-a');
      const bFiles = await service.findByResource('crux', 'crux-b');
      expect(aFiles).toHaveLength(1);
      expect(bFiles).toHaveLength(1);
      expect(aFiles[0]!.id).not.toBe(bFiles[0]!.id);
    });

    it('does NOT overwrite version attachments at the same path', async () => {
      // Create a regular artifact
      const artifact = await service.create({
        resourceId: cruxId,
        content: 'current',
        meta: { path: 'index.html' },
      });

      // Create a version snapshot at the same path
      const version = await service.upload({
        resourceId: cruxId,
        blob: new Blob(['snapshot']),
        type: 'version',
        meta: { path: 'index.html' },
      });

      // Both should exist — version didn't overwrite artifact
      expect(version.id).not.toBe(artifact.id);
      expect(version.type).toBe('version');

      const all = await db.artifacts.where('resourceId').equals(cruxId).toArray();
      expect(all).toHaveLength(2);
      expect(all.map((a) => a.type).sort()).toEqual(['artifact', 'version']);
    });

    it('overwrites only type:artifact, not type:version at same path', async () => {
      // Create artifact
      await service.create({
        resourceId: cruxId,
        content: 'v1',
        meta: { path: 'app.js' },
      });

      // Create a version snapshot
      await service.upload({
        resourceId: cruxId,
        blob: new Blob(['v1 snapshot']),
        type: 'version',
        meta: { path: 'app.js' },
      });

      // Overwrite the artifact — should NOT touch the version
      await service.create({
        resourceId: cruxId,
        content: 'v2',
        meta: { path: 'app.js' },
      });

      const all = await db.artifacts.where('resourceId').equals(cruxId).toArray();
      expect(all).toHaveLength(2); // 1 artifact (overwritten) + 1 version (preserved)

      const artifacts = all.filter((a) => a.type === 'artifact');
      const versions = all.filter((a) => a.type === 'version');
      expect(artifacts).toHaveLength(1);
      expect(versions).toHaveLength(1);
      expect(artifacts[0]!.content).toBe('v2');
    });
  });

  describe('upload (binary content)', () => {
    it('stores Blob content', async () => {
      const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
        type: 'image/png',
      });

      const attachment = await service.upload({
        resourceId: cruxId,
        blob,
        meta: { path: 'image.png' },
      });

      expect(attachment.encoding).toBe('binary');
      expect(attachment.mimeType).toBe('image/png');
      expect(attachment.size).toBe(4);
    });

    it('overwrites existing artifact at same path via upload', async () => {
      await service.upload({
        resourceId: cruxId,
        blob: new Blob(['old']),
        meta: { path: 'data.bin' },
      });

      await service.upload({
        resourceId: cruxId,
        blob: new Blob(['new']),
        meta: { path: 'data.bin' },
      });

      const all = await service.findByResource('crux', cruxId);
      expect(all).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('returns attachment by id', async () => {
      const created = await service.create({
        resourceId: cruxId,
        content: 'find me',
        meta: { path: 'find.txt' },
      });

      const found = await service.findById(created.id);
      expect(found.id).toBe(created.id);
      expect(found.meta?.path).toBe('find.txt');
    });

    it('throws NotFoundError for nonexistent id', async () => {
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findByResource', () => {
    it('returns all attachments for a resource', async () => {
      await service.create({ resourceId: cruxId, content: 'a', meta: { path: 'a.txt' } });
      await service.create({ resourceId: cruxId, content: 'b', meta: { path: 'b.txt' } });
      await service.create({ resourceId: 'other', content: 'c', meta: { path: 'c.txt' } });

      const results = await service.findByResource('crux', cruxId);
      expect(results).toHaveLength(2);
      expect(results.every((a) => a.resourceId === cruxId)).toBe(true);
    });
  });

  describe('readContent', () => {
    it('returns text content as string', async () => {
      const a = await service.create({
        resourceId: cruxId,
        content: 'hello world',
        meta: { path: 'hello.txt' },
      });

      const content = await service.readContent(a.id);
      expect(content).toBe('hello world');
    });

    it('throws for binary content', async () => {
      const a = await service.upload({
        resourceId: cruxId,
        blob: new Blob([new Uint8Array([1, 2, 3])]),
        meta: { path: 'data.bin' },
      });

      await expect(service.readContent(a.id)).rejects.toThrow('Cannot read binary content');
    });

    it('throws NotFoundError for nonexistent id', async () => {
      await expect(service.readContent('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('downloadBlob', () => {
    it('returns Blob for binary content', async () => {
      const original = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' });
      const a = await service.upload({
        resourceId: cruxId,
        blob: original,
        meta: { path: 'data.bin' },
      });

      const blob = await service.downloadBlob(a.id);
      expect(blob).toBeInstanceOf(Blob);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('wraps text content in a Blob', async () => {
      const a = await service.create({
        resourceId: cruxId,
        content: 'text as blob',
        meta: { path: 'file.txt' },
      });

      const blob = await service.downloadBlob(a.id);
      expect(blob).toBeInstanceOf(Blob);
      const text = await blob.text();
      expect(text).toBe('text as blob');
    });

    it('throws NotFoundError for nonexistent id', async () => {
      await expect(service.downloadBlob('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('update', () => {
    it('updates attachment metadata', async () => {
      const a = await service.create({
        resourceId: cruxId,
        content: 'test',
        meta: { path: 'old.txt' },
      });

      const updated = await service.update(a.id, {
        meta: { path: 'new.txt' },
      });

      expect(updated.meta?.path).toBe('new.txt');
    });

    it('deep-merges meta', async () => {
      const a = await service.create({
        resourceId: cruxId,
        content: 'test',
        meta: { path: 'file.txt', custom: 'keep' },
      });

      const updated = await service.update(a.id, {
        meta: { path: 'renamed.txt' },
      });

      expect(updated.meta?.path).toBe('renamed.txt');
      expect((updated.meta as Record<string, unknown>)?.custom).toBe('keep');
    });
  });

  describe('delete', () => {
    it('removes the attachment', async () => {
      const a = await service.create({
        resourceId: cruxId,
        content: 'delete me',
        meta: { path: 'temp.txt' },
      });

      await service.delete(a.id);
      await expect(service.findById(a.id)).rejects.toThrow(NotFoundError);
    });
  });
});
