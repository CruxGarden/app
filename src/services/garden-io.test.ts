import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { initServices, type Services } from './index';
import { exportGarden, importGarden } from './garden-io';
import { hashContent } from './sqlite/helpers';

/**
 * Garden export/import tests.
 *
 * These test the full-database .garden ZIP format (garden-io.ts).
 * The TestSqliteClient (in-memory) is injected by test/setup.ts.
 */

describe('Garden Export / Import', () => {
  let svc: Services;

  beforeEach(async () => {
    svc = await initServices('local');
  });

  describe('basic round-trip', () => {
    it('exports and re-imports an empty garden', async () => {
      const result = await exportGarden();

      expect(result.filename).toMatch(/^crux-garden-\d{8}\.garden$/);
      expect(result.blob.size).toBeGreaterThan(0);

      // Import back
      const imported = await importGarden({ data: result.blob });
      expect(imported.cruxCount).toBe(0);
      expect(imported.artifactCount).toBe(0);
    });

    it('round-trips cruxes through export/import', async () => {
      await svc.crux.create({ title: 'Crux A', type: 'workspace' });
      await svc.crux.create({ title: 'Crux B', type: 'workspace' });

      const result = await exportGarden();

      // Verify manifest
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      expect(manifest.cruxCount).toBe(2);

      // Import into a fresh DB (import replaces the whole database)
      const imported = await importGarden({ data: result.blob });
      expect(imported.cruxCount).toBe(2);
    });

    it('round-trips cruxes with artifacts', async () => {
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

      const result = await exportGarden();

      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      expect(manifest.artifactCount).toBe(2);

      // Artifacts directory should have 2 entries (unique fingerprints)
      const artifactFiles: string[] = [];
      zip.folder('artifacts')?.forEach((path) => artifactFiles.push(path));
      expect(artifactFiles).toHaveLength(2);

      // Import back
      const imported = await importGarden({ data: result.blob });
      expect(imported.cruxCount).toBe(1);
      expect(imported.artifactCount).toBe(2);
    });
  });

  describe('ZIP structure', () => {
    it('contains manifest.json and garden.sqlite', async () => {
      const result = await exportGarden();
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      expect(zip.file('manifest.json')).not.toBeNull();
      expect(zip.file('garden.sqlite')).not.toBeNull();
    });

    it('manifest has correct v1.0 format', async () => {
      const result = await exportGarden();
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));

      expect(manifest.version).toBe('1.0');
      expect(manifest.exportedAt).toBeDefined();
      expect(typeof manifest.cruxCount).toBe('number');
      expect(typeof manifest.artifactCount).toBe('number');
      expect(manifest.fingerprint).toBeDefined();
    });

    it('deduplicates identical artifacts by fingerprint', async () => {
      const cruxA = await svc.crux.create({ title: 'A', type: 'workspace' });
      const cruxB = await svc.crux.create({ title: 'B', type: 'workspace' });

      // Upload identical content to both cruxes
      const content = 'same content across cruxes';
      await svc.attachment.upload({
        resourceId: cruxA.id,
        blob: new File([content], 'file.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'file.txt' },
      });
      await svc.attachment.upload({
        resourceId: cruxB.id,
        blob: new File([content], 'file.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'file.txt' },
      });

      const result = await exportGarden();
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      // Only 1 artifact file despite 2 uploads (same fingerprint)
      const artifactFiles: string[] = [];
      zip.folder('artifacts')?.forEach((path) => artifactFiles.push(path));
      expect(artifactFiles).toHaveLength(1);
    });
  });

  describe('integrity verification', () => {
    it('fingerprint in manifest matches SQLite data', async () => {
      await svc.crux.create({ title: 'Fingerprint Test', type: 'workspace' });

      const result = await exportGarden();
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      const sqliteData = await zip.file('garden.sqlite')!.async('uint8array');
      const computed = await hashContent(sqliteData);

      expect(manifest.fingerprint).toBe(computed);
    });

    it('rejects import when fingerprint does not match', async () => {
      const result = await exportGarden();
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);

      // Tamper with manifest fingerprint
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      manifest.fingerprint = 'deadbeef';
      zip.file('manifest.json', JSON.stringify(manifest));

      const tampered = await zip.generateAsync({ type: 'arraybuffer' });
      await expect(importGarden({ data: tampered })).rejects.toThrow('integrity check failed');
    });
  });

  describe('manifest validation', () => {
    it('rejects ZIP without manifest.json', async () => {
      const zip = new JSZip();
      zip.file('garden.sqlite', new Uint8Array(0));
      const ab = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(importGarden({ data: ab })).rejects.toThrow('missing manifest.json');
    });

    it('rejects unsupported manifest version', async () => {
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify({ version: '99.0' }));
      zip.file('garden.sqlite', new Uint8Array(0));
      const ab = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(importGarden({ data: ab })).rejects.toThrow('Unsupported .garden format version');
    });

    it('rejects ZIP without garden.sqlite', async () => {
      const zip = new JSZip();
      zip.file('manifest.json', JSON.stringify({ version: '1.0' }));
      const ab = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(importGarden({ data: ab })).rejects.toThrow('missing garden.sqlite');
    });
  });

  describe('legacy format', () => {
    it('imports raw SQLite data (non-ZIP) as legacy format', async () => {
      // Export the current database as raw ArrayBuffer
      const { getSqliteClient } = await import('./sqlite/client');
      const rawSqlite = await getSqliteClient().export();

      // importGarden should detect this as non-ZIP and fall back to legacy import
      const imported = await importGarden({ data: rawSqlite });
      expect(imported.cruxCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('progress callbacks', () => {
    it('calls onProgress during export', async () => {
      const progress: string[] = [];
      await exportGarden({ onProgress: (s) => progress.push(s) });

      expect(progress.length).toBeGreaterThan(0);
      expect(progress.some((s) => s.includes('database'))).toBe(true);
    });

    it('calls onProgress during import', async () => {
      const result = await exportGarden();

      const progress: string[] = [];
      await importGarden({ data: result.blob, onProgress: (s) => progress.push(s) });

      expect(progress.length).toBeGreaterThan(0);
    });
  });
});
