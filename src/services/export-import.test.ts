import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { initServices, type Services } from './index';
import { exportCrux, importCrux, peekImport } from './crux-io';

/**
 * Export/Import round-trip tests.
 *
 * These tests exercise the service-layer functions in crux-io.ts.
 * The TestSqliteClient (in-memory) is injected by test/setup.ts.
 */

// ── Tests ───────────────────────────────────────────────

describe('Export / Import', () => {
  let svc: Services;

  beforeEach(async () => {
    svc = await initServices('local');
  });

  describe('basic round-trip', () => {
    it('exports and re-imports a crux with no artifacts', async () => {
      const crux = await svc.crux.create({ title: 'Empty Crux', type: 'workspace' });
      const result = await exportCrux({ cruxId: crux.id });

      // Delete original
      await svc.crux.delete(crux.id);

      // Import
      const imported = await importCrux({ data: result.blob });
      const importedCrux = await svc.crux.findById(imported.cruxId);
      expect(importedCrux.title).toBe('Empty Crux');
      expect(importedCrux.id).toBe(crux.id); // restore mode preserves ID
      expect(imported.failedArtifacts).toEqual([]);
    });

    it('exports and re-imports a crux with artifacts', async () => {
      const crux = await svc.crux.create({ title: 'With Files', type: 'workspace' });

      await svc.attachment.upload({
        resourceId: crux.id,
        blob: new File(['<h1>Hello</h1>'], 'index.html', { type: 'text/html' }),
        mimeType: 'text/html',
        meta: { path: 'index.html' },
      });
      await svc.attachment.upload({
        resourceId: crux.id,
        blob: new File(['body { color: red }'], 'style.css', { type: 'text/css' }),
        mimeType: 'text/css',
        meta: { path: 'style.css' },
      });

      const result = await exportCrux({ cruxId: crux.id });
      await svc.crux.delete(crux.id);

      const imported = await importCrux({ data: result.blob });
      const importedArtifacts = await svc.attachment.findByResource('crux', imported.cruxId);

      expect(importedArtifacts).toHaveLength(2);
      expect(imported.failedArtifacts).toEqual([]);
      const paths = importedArtifacts.map((a) => a.meta?.path).sort();
      expect(paths).toEqual(['index.html', 'style.css']);

      // Verify content survived the round-trip
      const htmlArt = importedArtifacts.find((a) => a.meta?.path === 'index.html')!;
      const contentBlob = await svc.attachment.downloadBlob(htmlArt.id);
      const content = await contentBlob.text();
      expect(content).toBe('<h1>Hello</h1>');
    });

    it('preserves messages through round-trip', async () => {
      const crux = await svc.crux.create({ title: 'Chat Test', type: 'workspace' });
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      // Export with messages
      const result = await exportCrux({ cruxId: crux.id, messages });
      await svc.crux.delete(crux.id);

      const imported = await importCrux({ data: result.blob });
      const importedCrux = await svc.crux.findById(imported.cruxId);
      expect(importedCrux.meta?.messages).toEqual(messages);
    });
  });

  describe('snapshots (version history)', () => {
    it('exports and re-imports snapshots with growth dimensions', async () => {
      const crux = await svc.crux.create({ title: 'Versioned', type: 'workspace' });

      // Add an artifact
      await svc.attachment.upload({
        resourceId: crux.id,
        blob: new File(['v1'], 'index.html', { type: 'text/html' }),
        mimeType: 'text/html',
        meta: { path: 'index.html' },
      });

      // Take snapshot 1
      const snap1 = await svc.crux.create({
        slug: 'snapshot-1',
        title: 'Snapshot 1',
        type: 'crux',
        kind: 'snapshot',
      });
      await svc.attachment.cloneArtifactsToSnapshot(crux.id, snap1.id);
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap1.id,
        type: 'growth',
        weight: 1,
      });

      // Modify workspace and take snapshot 2
      await svc.attachment.upload({
        resourceId: crux.id,
        blob: new File(['body{}'], 'style.css', { type: 'text/css' }),
        mimeType: 'text/css',
        meta: { path: 'style.css' },
      });

      const snap2 = await svc.crux.create({
        slug: 'snapshot-2',
        title: 'Snapshot 2',
        type: 'crux',
        kind: 'snapshot',
      });
      await svc.attachment.cloneArtifactsToSnapshot(crux.id, snap2.id);
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap2.id,
        type: 'growth',
        weight: 2,
      });

      // Export
      const result = await exportCrux({ cruxId: crux.id });

      // Delete everything
      await svc.crux.delete(crux.id);
      await svc.crux.delete(snap1.id);
      await svc.crux.delete(snap2.id);

      // Import
      const imported = await importCrux({ data: result.blob });

      // Verify growth dimensions restored
      const growths = await svc.dimension.findBySourceAndType(imported.cruxId, 'growth');
      expect(growths).toHaveLength(2);

      const sorted = growths.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));
      expect(sorted[0]!.weight).toBe(1);
      expect(sorted[1]!.weight).toBe(2);

      // Verify snapshot cruxes exist and have artifacts
      const snap1Artifacts = await svc.attachment.findByResource('crux', sorted[0]!.targetId);
      expect(snap1Artifacts).toHaveLength(1); // only index.html at snapshot 1

      const snap2Artifacts = await svc.attachment.findByResource('crux', sorted[1]!.targetId);
      expect(snap2Artifacts).toHaveLength(2); // index.html + style.css at snapshot 2

      // Verify growthCount in meta and result
      const importedCrux = await svc.crux.findById(imported.cruxId);
      expect(importedCrux.meta?.growthCount).toBe(2);
      expect(imported.growthCount).toBe(2);
    });

    it('deduplicates identical artifacts across snapshots', async () => {
      const crux = await svc.crux.create({ title: 'Dedup Test', type: 'workspace' });

      // Upload a file
      await svc.attachment.upload({
        resourceId: crux.id,
        blob: new File(['same content'], 'file.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'file.txt' },
      });

      // Take two snapshots (same file content each time)
      for (let i = 1; i <= 2; i++) {
        const snap = await svc.crux.create({
          slug: `snapshot-${i}`,
          title: `Snapshot ${i}`,
          type: 'crux',
          kind: 'snapshot',
        });
        await svc.attachment.cloneArtifactsToSnapshot(crux.id, snap.id);
        await svc.dimension.create({
          sourceId: crux.id,
          targetId: snap.id,
          type: 'growth',
          weight: i,
        });
      }

      const result = await exportCrux({ cruxId: crux.id });

      // Verify the exported ZIP has only 1 unique artifact file (deduped by fingerprint)
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const artifactFiles: string[] = [];
      zip.folder('artifacts')?.forEach((relativePath) => {
        artifactFiles.push(relativePath);
      });
      expect(artifactFiles).toHaveLength(1); // single fingerprint
    });
  });

  describe('conflict resolution', () => {
    it('clone mode generates new IDs', async () => {
      const crux = await svc.crux.create({ title: 'Original', type: 'workspace' });
      const originalId = crux.id;

      await svc.attachment.upload({
        resourceId: crux.id,
        blob: new File(['hello'], 'file.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'file.txt' },
      });

      const result = await exportCrux({ cruxId: crux.id });

      // Import as clone (original still exists)
      const imported = await importCrux({ data: result.blob, mode: 'clone' });

      // IDs should differ
      expect(imported.cruxId).not.toBe(originalId);

      // Both should exist
      const original = await svc.crux.findById(originalId);
      const cloned = await svc.crux.findById(imported.cruxId);
      expect(original.title).toBe('Original');
      expect(cloned.title).toBe('Original');

      // Cloned slug should differ
      expect(cloned.slug).not.toBe(original.slug);

      // Both should have artifacts
      const originalArts = await svc.attachment.findByResource('crux', originalId);
      const clonedArts = await svc.attachment.findByResource('crux', imported.cruxId);
      expect(originalArts).toHaveLength(1);
      expect(clonedArts).toHaveLength(1);
    });

    it('replace mode deletes existing and restores with same IDs', async () => {
      const crux = await svc.crux.create({ title: 'To Replace', type: 'workspace' });
      const originalId = crux.id;

      await svc.attachment.upload({
        resourceId: crux.id,
        blob: new File(['original'], 'file.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'file.txt' },
      });

      const result = await exportCrux({ cruxId: crux.id });

      // Modify the existing crux
      await svc.crux.update(crux.id, { title: 'Modified' });

      // Import with replace
      const imported = await importCrux({ data: result.blob, mode: 'replace' });

      // Should have same ID
      expect(imported.cruxId).toBe(originalId);

      // Title should be restored from export
      const restored = await svc.crux.findById(imported.cruxId);
      expect(restored.title).toBe('To Replace');
    });

    it('restore mode preserves original IDs', async () => {
      const crux = await svc.crux.create({ title: 'Restoring', type: 'workspace' });
      const originalId = crux.id;
      const originalSlug = crux.slug;

      const result = await exportCrux({ cruxId: crux.id });

      // Delete original
      await svc.crux.delete(crux.id);

      // Restore
      const imported = await importCrux({ data: result.blob, mode: 'restore' });
      expect(imported.cruxId).toBe(originalId);

      const restored = await svc.crux.findById(imported.cruxId);
      expect(restored.slug).toBe(originalSlug);
    });
  });

  describe('peekImport (conflict detection)', () => {
    it('returns null conflict when crux does not exist locally', async () => {
      const crux = await svc.crux.create({ title: 'Will Delete', type: 'workspace' });
      const result = await exportCrux({ cruxId: crux.id });
      await svc.crux.delete(crux.id);

      const { cruxData, conflict } = await peekImport(result.blob);
      expect(conflict).toBeNull();
      expect(cruxData.title).toBe('Will Delete');
    });

    it('detects conflict when crux exists locally', async () => {
      const crux = await svc.crux.create({ title: 'Existing', type: 'workspace' });

      // Create 2 snapshots so growthCount = 2
      for (let i = 1; i <= 2; i++) {
        const snap = await svc.crux.create({
          slug: `snap-${i}`,
          title: `Snap ${i}`,
          type: 'crux',
          kind: 'snapshot',
        });
        await svc.dimension.create({
          sourceId: crux.id,
          targetId: snap.id,
          type: 'growth',
          weight: i,
        });
      }

      const result = await exportCrux({ cruxId: crux.id });

      // Don't delete — crux still exists locally
      const { conflict } = await peekImport(result.blob);
      expect(conflict).not.toBeNull();
      expect(conflict!.title).toBe('Existing');
      expect(conflict!.incomingVersion).toBe(2);
    });
  });

  describe('manifest validation', () => {
    it('rejects ZIP without manifest.json', async () => {
      const zip = new JSZip();
      zip.file('crux.json', JSON.stringify({ id: 'test', title: 'Bad' }));
      const ab = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(importCrux({ data: ab })).rejects.toThrow('missing manifest.json');
    });

    it('rejects unsupported manifest version', async () => {
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify({ version: '99.0' }));
      zip.file('crux.json', JSON.stringify({ id: 'test', title: 'Bad' }));
      const ab = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(importCrux({ data: ab })).rejects.toThrow('Unsupported .crux format version');
    });

    it('accepts v3.x manifest versions', async () => {
      // Build a minimal valid v3 ZIP
      const crux = await svc.crux.create({ title: 'V3 Compat', type: 'workspace' });
      const result = await exportCrux({ cruxId: crux.id });
      await svc.crux.delete(crux.id);

      // Patch manifest to v3.1
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      manifest.version = '3.1';
      zip.file('manifest.json', JSON.stringify(manifest));
      const patched = await zip.generateAsync({ type: 'arraybuffer' });

      // Should not throw
      const imported = await importCrux({ data: patched });
      expect(imported.cruxId).toBeDefined();
    });
  });

  describe('rollback on failure', () => {
    it('does not leave orphaned cruxes when import errors before crux creation', async () => {
      // Tamper: valid manifest but missing crux.json → fails before any DB writes
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify({ version: '3.0' }));
      const ab = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(importCrux({ data: ab })).rejects.toThrow('missing crux.json');
    });

    it('restores original crux from backup when replace mode fails mid-import', async () => {
      // Create original crux with an artifact
      const crux = await svc.crux.create({ title: 'Original', type: 'workspace' });
      await svc.attachment.upload({
        resourceId: crux.id,
        blob: new File(['original content'], 'readme.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'readme.txt' },
      });

      // Export with messages so we can verify full restoration
      const exported = await exportCrux({ cruxId: crux.id, messages: [{ role: 'user', content: 'hello' }] });

      // Spy on cruxService.update to throw ONCE — this is the final meta update step,
      // which runs AFTER the delete + create succeed, triggering the rollback path.
      // Must only throw once so the backup restore's own update call succeeds.
      const originalUpdate = svc.crux.update.bind(svc.crux);
      let shouldFail = true;
      svc.crux.update = async (...args) => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('Simulated update failure');
        }
        return originalUpdate(...args);
      };

      try {
        await expect(
          importCrux({ data: exported.blob, mode: 'replace' }),
        ).rejects.toThrow('Simulated update failure');
      } finally {
        svc.crux.update = originalUpdate;
      }

      // The original crux should be restored from the safety backup
      const restored = await svc.crux.findById(crux.id);
      expect(restored.title).toBe('Original');
    });

    it('cleans up on restore mode when crux already exists (duplicate ID)', async () => {
      const crux = await svc.crux.create({ title: 'Already Here', type: 'workspace' });
      const result = await exportCrux({ cruxId: crux.id });

      // Don't delete — try restore mode with the same ID still in DB
      // cruxService.create with a duplicate ID should fail (UNIQUE constraint)
      // This exercises the rollback path since the error happens inside the try block
      await expect(importCrux({ data: result.blob, mode: 'restore' })).rejects.toThrow();

      // The original crux should still be intact (not corrupted by partial import)
      const existing = await svc.crux.findById(crux.id);
      expect(existing.title).toBe('Already Here');
    });
  });

  describe('export accuracy', () => {
    it('derives growthCount from actual data, not caller input', async () => {
      const crux = await svc.crux.create({ title: 'Count Test', type: 'workspace' });

      // Create 3 snapshots
      for (let i = 1; i <= 3; i++) {
        const snap = await svc.crux.create({
          slug: `snap-${i}`,
          title: `Snap ${i}`,
          type: 'crux',
          kind: 'snapshot',
        });
        await svc.dimension.create({
          sourceId: crux.id,
          targetId: snap.id,
          type: 'growth',
          weight: i,
        });
      }

      // Export without passing growthCount — it should derive it
      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      const cruxJson = JSON.parse(await zip.file('crux.json')!.async('text'));
      expect(cruxJson.meta.growthCount).toBe(3);

      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      expect(manifest.snapshotCount).toBe(3);
    });

    it('reports failed snapshots in export result', async () => {
      const crux = await svc.crux.create({ title: 'Fail Test', type: 'workspace' });

      // Create a growth dimension pointing to a non-existent snapshot
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: 'non-existent-id',
        type: 'growth',
        weight: 1,
      });

      const result = await exportCrux({ cruxId: crux.id });

      // Should report the failure
      expect(result.failed.length).toBeGreaterThan(0);
      expect(result.failed.some((f) => f.includes('snapshot'))).toBe(true);

      // manifest snapshotCount should be 0 (the snapshot failed to export)
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      expect(manifest.snapshotCount).toBe(0);
    });
  });

  describe('ZIP structure validation', () => {
    it('exported ZIP contains all required files', async () => {
      const crux = await svc.crux.create({ title: 'Structure Test', type: 'workspace' });
      await svc.attachment.upload({
        resourceId: crux.id,
        blob: new File(['test'], 'test.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'test.txt' },
      });

      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      expect(zip.file('manifest.json')).not.toBeNull();
      expect(zip.file('crux.json')).not.toBeNull();
      expect(zip.file('messages.json')).not.toBeNull();
      expect(zip.file('versions/current.json')).not.toBeNull();
    });

    it('manifest.json has correct v3.0 format', async () => {
      const crux = await svc.crux.create({ title: 'Manifest Test', type: 'workspace' });

      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));

      expect(manifest.version).toBe('3.0');
      expect(manifest.exportedAt).toBeDefined();
      expect(typeof manifest.artifactCount).toBe('number');
      expect(typeof manifest.snapshotCount).toBe('number');
    });

    it('crux.json contains workspace metadata', async () => {
      const crux = await svc.crux.create({
        title: 'Meta Test',
        description: 'A test crux',
        type: 'workspace',
      });

      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const cruxJson = JSON.parse(await zip.file('crux.json')!.async('text'));

      expect(cruxJson.id).toBe(crux.id);
      expect(cruxJson.title).toBe('Meta Test');
      expect(cruxJson.description).toBe('A test crux');
      expect(cruxJson.type).toBe('workspace');
    });
  });
});
