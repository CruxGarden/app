import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { initServices, type Services } from './index';
import { exportCrux, importCrux, peekImport } from './crux-io';

/**
 * Export/Import round-trip tests — v3.1 format.
 *
 * These tests exercise the service-layer functions in crux-io.ts.
 * The TestSqliteClient (in-memory + Map-based blob storage) is injected by test/setup.ts.
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

      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File(['<h1>Hello</h1>'], 'index.html', { type: 'text/html' }),
        mimeType: 'text/html',
        meta: { path: 'index.html' },
      });
      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File(['body { color: red }'], 'style.css', { type: 'text/css' }),
        mimeType: 'text/css',
        meta: { path: 'style.css' },
      });

      const result = await exportCrux({ cruxId: crux.id });
      await svc.crux.delete(crux.id);

      const imported = await importCrux({ data: result.blob });
      const importedArtifacts = await svc.artifact.findByResource('crux', imported.cruxId);

      expect(importedArtifacts).toHaveLength(2);
      expect(imported.failedArtifacts).toEqual([]);
      const paths = importedArtifacts.map((a) => a.meta?.path).sort();
      expect(paths).toEqual(['index.html', 'style.css']);

      // Verify content survived the round-trip
      const htmlArt = importedArtifacts.find((a) => a.meta?.path === 'index.html')!;
      const contentBlob = await svc.artifact.downloadBlob(htmlArt.id);
      const content = await contentBlob.text();
      expect(content).toBe('<h1>Hello</h1>');
    });

    it('preserves messages through round-trip via version manifests', async () => {
      const crux = await svc.crux.create({ title: 'Chat Test', type: 'workspace' });
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      // Export with messages (current segment)
      const result = await exportCrux({ cruxId: crux.id, messages });
      await svc.crux.delete(crux.id);

      const imported = await importCrux({ data: result.blob });
      const importedCrux = await svc.crux.findById(imported.cruxId);
      expect(importedCrux.meta?.messages).toEqual(messages);

      // Verify messages are in the version manifest, not a flat file
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const currentManifest = JSON.parse(await zip.file('versions/current.json')!.async('text'));
      expect(currentManifest.messages).toEqual(messages);
    });
  });

  describe('snapshots (version history)', () => {
    it('exports and re-imports snapshots with growth dimensions', async () => {
      const crux = await svc.crux.create({ title: 'Versioned', type: 'workspace' });

      // Add an artifact
      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File(['v1'], 'index.html', { type: 'text/html' }),
        mimeType: 'text/html',
        meta: { path: 'index.html' },
      });

      // Take snapshot 1 with messages
      const snap1 = await svc.crux.create({
        slug: 'snapshot-1',
        title: 'Snapshot 1',
        type: 'crux',
        kind: 'snapshot',
        meta: { messages: [{ role: 'user', content: 'First turn' }] },
      });
      await svc.artifact.cloneArtifactsToSnapshot(crux.id, snap1.id);
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap1.id,
        type: 'growth',
        weight: 1,
      });

      // Modify workspace and take snapshot 2
      await svc.artifact.upload({
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
        meta: { messages: [{ role: 'user', content: 'Second turn' }], parentCruxId: snap1.id },
      });
      await svc.artifact.cloneArtifactsToSnapshot(crux.id, snap2.id);
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
      const snap1Artifacts = await svc.artifact.findByResource('crux', sorted[0]!.targetId);
      expect(snap1Artifacts).toHaveLength(1); // only index.html at snapshot 1

      const snap2Artifacts = await svc.artifact.findByResource('crux', sorted[1]!.targetId);
      expect(snap2Artifacts).toHaveLength(2); // index.html + style.css at snapshot 2

      // Verify growthCount in meta and result
      const importedCrux = await svc.crux.findById(imported.cruxId);
      expect(importedCrux.meta?.growthCount).toBe(2);
      expect(imported.growthCount).toBe(2);

      // Verify snapshot messages survived the round-trip
      const snap1Crux = await svc.crux.findById(sorted[0]!.targetId);
      expect(snap1Crux.meta?.messages).toEqual([{ role: 'user', content: 'First turn' }]);

      const snap2Crux = await svc.crux.findById(sorted[1]!.targetId);
      expect(snap2Crux.meta?.messages).toEqual([{ role: 'user', content: 'Second turn' }]);
    });

    it('preserves parentIndex through round-trip', async () => {
      const crux = await svc.crux.create({ title: 'Parent Test', type: 'workspace' });

      const snap1 = await svc.crux.create({
        slug: 'snapshot-1',
        title: 'Snapshot 1',
        type: 'crux',
        kind: 'snapshot',
        meta: { messages: [] },
      });
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap1.id,
        type: 'growth',
        weight: 1,
      });

      const snap2 = await svc.crux.create({
        slug: 'snapshot-2',
        title: 'Snapshot 2',
        type: 'crux',
        kind: 'snapshot',
        meta: { messages: [], parentCruxId: snap1.id },
      });
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap2.id,
        type: 'growth',
        weight: 2,
      });

      // Export and check version manifests
      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      const v0 = JSON.parse(await zip.file('versions/0.json')!.async('text'));
      const v1 = JSON.parse(await zip.file('versions/1.json')!.async('text'));
      expect(v0.parentIndex).toBeNull(); // first snapshot has no parent
      expect(v1.parentIndex).toBe(0); // second snapshot's parent is snapshot 0

      // Delete and re-import
      await svc.crux.delete(crux.id);
      await svc.crux.delete(snap1.id);
      await svc.crux.delete(snap2.id);

      const imported = await importCrux({ data: result.blob });
      const growths = await svc.dimension.findBySourceAndType(imported.cruxId, 'growth');
      const sorted = growths.sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0));

      // Verify parentCruxId was restored from parentIndex
      const restoredSnap2 = await svc.crux.findById(sorted[1]!.targetId);
      expect(restoredSnap2.meta?.parentCruxId).toBe(sorted[0]!.targetId);
    });

    it('deduplicates identical artifacts across snapshots', async () => {
      const crux = await svc.crux.create({ title: 'Dedup Test', type: 'workspace' });

      // Upload a file
      await svc.artifact.upload({
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
        await svc.artifact.cloneArtifactsToSnapshot(crux.id, snap.id);
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

  describe('dimensions.json', () => {
    it('exports dimensions with metadata', async () => {
      const crux = await svc.crux.create({ title: 'Dim Test', type: 'workspace' });

      const snap1 = await svc.crux.create({
        slug: 'snapshot-1',
        title: 'Snapshot 1',
        type: 'crux',
        kind: 'snapshot',
      });
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap1.id,
        type: 'growth',
        weight: 1,
        meta: {
          summary: 'Created initial landing page',
          artifactCount: 2,
          preview: { type: 'html', path: 'index.html', mimeType: 'text/html' },
        },
      });

      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      const dimensions = JSON.parse(await zip.file('dimensions.json')!.async('text'));
      expect(dimensions).toHaveLength(1);
      expect(dimensions[0].sourceIndex).toBe('current');
      expect(dimensions[0].targetIndex).toBe(0);
      expect(dimensions[0].type).toBe('growth');
      expect(dimensions[0].weight).toBe(1);
      expect(dimensions[0].meta.summary).toBe('Created initial landing page');
      expect(dimensions[0].meta.artifactCount).toBe(2);
      expect(dimensions[0].meta.preview.type).toBe('html');
    });

    it('preserves dimension metadata through round-trip', async () => {
      const crux = await svc.crux.create({ title: 'Meta Round-Trip', type: 'workspace' });

      const snap = await svc.crux.create({
        slug: 'snapshot-1',
        title: 'Snap',
        type: 'crux',
        kind: 'snapshot',
      });
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap.id,
        type: 'growth',
        weight: 1,
        meta: {
          summary: 'Added dark mode',
          artifactCount: 5,
        },
      });

      const result = await exportCrux({ cruxId: crux.id });
      await svc.crux.delete(crux.id);
      await svc.crux.delete(snap.id);

      const imported = await importCrux({ data: result.blob });
      const growths = await svc.dimension.findBySourceAndType(imported.cruxId, 'growth');
      expect(growths).toHaveLength(1);
      expect(growths[0]!.meta?.summary).toBe('Added dark mode');
      expect(growths[0]!.meta?.artifactCount).toBe(5);
    });

    it('converts thumbnailId to thumbnailPath and back', async () => {
      const crux = await svc.crux.create({ title: 'Thumb Test', type: 'workspace' });

      // Create a preview.jpg artifact
      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File([new Uint8Array([0xff, 0xd8, 0xff])], 'preview.jpg', { type: 'image/jpeg' }),
        mimeType: 'image/jpeg',
        meta: { path: 'preview.jpg' },
      });

      const snap = await svc.crux.create({
        slug: 'snapshot-1',
        title: 'Snap',
        type: 'crux',
        kind: 'snapshot',
      });
      await svc.artifact.cloneArtifactsToSnapshot(crux.id, snap.id);

      // Get the snapshot's preview.jpg artifact ID
      const snapArtifacts = await svc.artifact.findByResource('crux', snap.id);
      const thumbArt = snapArtifacts.find((a) => a.meta?.path === 'preview.jpg')!;

      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap.id,
        type: 'growth',
        weight: 1,
        meta: { thumbnailId: thumbArt.id },
      });

      // Export — should convert thumbnailId → thumbnailPath
      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const dimensions = JSON.parse(await zip.file('dimensions.json')!.async('text'));
      expect(dimensions[0].meta.thumbnailPath).toBe('preview.jpg');
      expect(dimensions[0].meta.thumbnailId).toBeUndefined();

      // Delete and re-import — should convert thumbnailPath → thumbnailId
      await svc.crux.delete(crux.id);
      await svc.crux.delete(snap.id);

      const imported = await importCrux({ data: result.blob });
      const growths = await svc.dimension.findBySourceAndType(imported.cruxId, 'growth');
      expect(growths[0]!.meta?.thumbnailId).toBeDefined();
      expect(growths[0]!.meta?.thumbnailPath).toBeUndefined();
    });
  });

  describe('conflict resolution', () => {
    it('clone mode generates new IDs', async () => {
      const crux = await svc.crux.create({ title: 'Original', type: 'workspace' });
      const originalId = crux.id;

      await svc.artifact.upload({
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
      const originalArts = await svc.artifact.findByResource('crux', originalId);
      const clonedArts = await svc.artifact.findByResource('crux', imported.cruxId);
      expect(originalArts).toHaveLength(1);
      expect(clonedArts).toHaveLength(1);
    });

    it('replace mode deletes existing and restores with same IDs', async () => {
      const crux = await svc.crux.create({ title: 'To Replace', type: 'workspace' });
      const originalId = crux.id;

      await svc.artifact.upload({
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

      // Patch manifest to v3.2
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      manifest.version = '3.2';
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
      zip.file('manifest.json', JSON.stringify({ version: '3.1' }));
      const ab = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(importCrux({ data: ab })).rejects.toThrow('missing crux.json');
    });

    it('restores original crux from backup when replace mode fails mid-import', async () => {
      // Create original crux with an artifact
      const crux = await svc.crux.create({ title: 'Original', type: 'workspace' });
      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File(['original content'], 'readme.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'readme.txt' },
      });

      // Export with messages so we can verify full restoration
      const exported = await exportCrux({ cruxId: crux.id, messages: [{ role: 'user', content: 'hello' }] });

      // Spy on cruxService.update to throw ONCE — this is the final meta update step,
      // which runs AFTER the delete + create succeed, triggering the rollback path.
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
      await expect(importCrux({ data: result.blob, mode: 'restore' })).rejects.toThrow();

      // The original crux should still be intact
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

      // manifest snapshotCount should be 0
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      expect(manifest.snapshotCount).toBe(0);
    });
  });

  describe('ZIP structure validation', () => {
    it('exported ZIP contains all required files', async () => {
      const crux = await svc.crux.create({ title: 'Structure Test', type: 'workspace' });
      await svc.artifact.upload({
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
      expect(zip.file('dimensions.json')).not.toBeNull();
      expect(zip.file('versions/current.json')).not.toBeNull();
    });

    it('manifest.json has correct v3.1 format', async () => {
      const crux = await svc.crux.create({ title: 'Manifest Test', type: 'workspace' });

      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));

      expect(manifest.version).toBe('3.1');
      expect(manifest.exportedAt).toBeDefined();
      expect(typeof manifest.artifactCount).toBe('number');
      expect(typeof manifest.snapshotCount).toBe('number');
    });

    it('crux.json does not contain messages (they live in version manifests)', async () => {
      const crux = await svc.crux.create({ title: 'No Messages', type: 'workspace' });
      const result = await exportCrux({ cruxId: crux.id, messages: [{ role: 'user', content: 'test' }] });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const cruxJson = JSON.parse(await zip.file('crux.json')!.async('text'));

      // messages should not be in crux.json meta
      expect(cruxJson.meta.messages).toBeUndefined();
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

  describe('format efficiency', () => {
    it('snapshot version manifests do not duplicate messages in crux.meta', async () => {
      const crux = await svc.crux.create({ title: 'No Dup', type: 'workspace' });
      const snapMessages = [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }];

      const snap = await svc.crux.create({
        slug: 'snapshot-1',
        title: 'Snap',
        type: 'crux',
        kind: 'snapshot',
        meta: { messages: snapMessages, fingerprint: 'abc', cumulativeMessageCount: 2 },
      });
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap.id,
        type: 'growth',
        weight: 1,
      });

      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const v0 = JSON.parse(await zip.file('versions/0.json')!.async('text'));

      // messages should be at the top level, NOT inside crux.meta
      expect(v0.messages).toEqual(snapMessages);
      expect(v0.crux.meta.messages).toBeUndefined();
    });

    it('snapshot version manifests do not duplicate parentCruxId in crux.meta', async () => {
      const crux = await svc.crux.create({ title: 'No Dup Parent', type: 'workspace' });

      const snap1 = await svc.crux.create({
        slug: 'snapshot-1',
        title: 'Snap 1',
        type: 'crux',
        kind: 'snapshot',
        meta: { messages: [] },
      });
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap1.id,
        type: 'growth',
        weight: 1,
      });

      const snap2 = await svc.crux.create({
        slug: 'snapshot-2',
        title: 'Snap 2',
        type: 'crux',
        kind: 'snapshot',
        meta: { messages: [], parentCruxId: snap1.id },
      });
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap2.id,
        type: 'growth',
        weight: 2,
      });

      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const v1 = JSON.parse(await zip.file('versions/1.json')!.async('text'));

      // parentIndex should be at the top level, parentCruxId should NOT be in crux.meta
      expect(v1.parentIndex).toBe(0);
      expect(v1.crux.meta.parentCruxId).toBeUndefined();
    });

    it('cumulativeMessageCount survives round-trip in crux.meta', async () => {
      const crux = await svc.crux.create({ title: 'Cumulative', type: 'workspace' });

      const snap = await svc.crux.create({
        slug: 'snapshot-1',
        title: 'Snap',
        type: 'crux',
        kind: 'snapshot',
        meta: { messages: [{ role: 'user', content: 'a' }], cumulativeMessageCount: 5 },
      });
      await svc.dimension.create({
        sourceId: crux.id,
        targetId: snap.id,
        type: 'growth',
        weight: 1,
      });

      const result = await exportCrux({ cruxId: crux.id });
      await svc.crux.delete(crux.id);
      await svc.crux.delete(snap.id);

      const imported = await importCrux({ data: result.blob });
      const growths = await svc.dimension.findBySourceAndType(imported.cruxId, 'growth');
      const restoredSnap = await svc.crux.findById(growths[0]!.targetId);
      expect(restoredSnap.meta?.cumulativeMessageCount).toBe(5);
    });

    it('binary blobs are fully deduped across current + snapshots', async () => {
      const crux = await svc.crux.create({ title: 'Full Dedup', type: 'workspace' });

      // Same content used across workspace + 3 snapshots
      const sharedContent = 'shared file content that appears everywhere';
      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File([sharedContent], 'shared.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'shared.txt' },
      });

      for (let i = 1; i <= 3; i++) {
        const snap = await svc.crux.create({
          slug: `snapshot-${i}`,
          title: `Snap ${i}`,
          type: 'crux',
          kind: 'snapshot',
          meta: { messages: [] },
        });
        await svc.artifact.cloneArtifactsToSnapshot(crux.id, snap.id);
        await svc.dimension.create({
          sourceId: crux.id,
          targetId: snap.id,
          type: 'growth',
          weight: i,
        });
      }

      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      // Count files in artifacts/ — should be exactly 1 (same fingerprint everywhere)
      const artifactFiles: string[] = [];
      zip.folder('artifacts')?.forEach((p) => artifactFiles.push(p));
      expect(artifactFiles).toHaveLength(1);

      // But all 4 version manifests (current + 3 snapshots) reference it
      const current = JSON.parse(await zip.file('versions/current.json')!.async('text'));
      expect(Object.keys(current.artifacts)).toHaveLength(1);
      for (let i = 0; i < 3; i++) {
        const sv = JSON.parse(await zip.file(`versions/${i}.json`)!.async('text'));
        expect(Object.keys(sv.artifacts)).toHaveLength(1);
        // All reference the same fingerprint
        expect(Object.values(sv.artifacts)[0]).toEqual(Object.values(current.artifacts)[0]);
      }
    });

    it('version manifests reference artifacts by path → fingerprint (not embedded content)', async () => {
      const crux = await svc.crux.create({ title: 'Ref Check', type: 'workspace' });

      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File(['<h1>hi</h1>'], 'index.html', { type: 'text/html' }),
        mimeType: 'text/html',
        meta: { path: 'index.html' },
      });
      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File(['body{}'], 'style.css', { type: 'text/css' }),
        mimeType: 'text/css',
        meta: { path: 'style.css' },
      });

      const result = await exportCrux({ cruxId: crux.id });
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const current = JSON.parse(await zip.file('versions/current.json')!.async('text'));

      // Each artifact entry has fingerprint, mimeType, size — no content
      for (const [_path, info] of Object.entries(current.artifacts) as [string, Record<string, unknown>][]) {
        expect(typeof info.fingerprint).toBe('string');
        expect(info.fingerprint).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
        expect(typeof info.mimeType).toBe('string');
        expect(typeof info.size).toBe('number');
        // No content field
        expect(info.content).toBeUndefined();
      }

      // Fingerprints correspond to actual files in artifacts/
      for (const info of Object.values(current.artifacts) as { fingerprint: string }[]) {
        expect(zip.file(`artifacts/${info.fingerprint}`)).not.toBeNull();
      }
    });

    it('import creates correct encoding for text vs binary artifacts', async () => {
      const crux = await svc.crux.create({ title: 'Encoding Test', type: 'workspace' });

      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File(['hello'], 'readme.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'readme.txt' },
      });
      await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg', { type: 'image/jpeg' }),
        mimeType: 'image/jpeg',
        meta: { path: 'photo.jpg' },
      });

      const result = await exportCrux({ cruxId: crux.id });
      await svc.crux.delete(crux.id);

      const imported = await importCrux({ data: result.blob });
      const arts = await svc.artifact.findByResource('crux', imported.cruxId);

      const txt = arts.find((a) => a.meta?.path === 'readme.txt')!;
      const jpg = arts.find((a) => a.meta?.path === 'photo.jpg')!;

      expect(txt.encoding).toBe('utf-8');
      expect(jpg.encoding).toBe('binary');
    });
  });
});
