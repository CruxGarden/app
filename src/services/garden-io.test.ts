import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { initServices, type Services } from './index';
import { exportGarden, importGarden } from './garden-io';
import { hashContent } from './sqlite/helpers';
import { getSqliteClient } from './sqlite/client';

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
  afterEach(() => vi.restoreAllMocks());

  it('exports content from the captured database even when live references change afterward', async () => {
    const crux = await svc.crux.create({ title: 'Captured work', type: 'workspace' });
    const file = await svc.artifact.upload({
      resourceId: crux.id,
      blob: new File(['Snapshot bytes'], 'captured.txt'),
      meta: { path: 'captured.txt' },
    });
    const db = getSqliteClient();
    const capture = db.export.bind(db);
    vi.spyOn(db, 'export').mockImplementation(async () => {
      const image = await capture();
      // A later edit removes this reference from the live working database.
      await db.run('DELETE FROM artifacts WHERE id = ?', [file.id]);
      return image;
    });
    const archive = await exportGarden();
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    expect(await zip.file(`artifacts/${file.fingerprint}`)?.async('text')).toBe('Snapshot bytes');
  });

  it('refuses a missing referenced blob even when the archive count was adjusted and a local copy exists', async () => {
    const incoming = await svc.crux.create({ title: 'Incoming', type: 'workspace' });
    const file = await svc.artifact.upload({
      resourceId: incoming.id,
      blob: new File(['Referenced bytes'], 'incoming.txt'),
      meta: { path: 'incoming.txt' },
    });
    const archive = await exportGarden();
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    zip.remove(`artifacts/${file.fingerprint}`);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
    zip.file(
      'manifest.json',
      JSON.stringify({ ...manifest, artifactCount: manifest.artifactCount - 1 }),
    );
    const existing = await svc.crux.create({ title: 'Keep me', type: 'workspace' });
    const replace = vi.spyOn(getSqliteClient(), 'import');
    await expect(
      importGarden({ data: await zip.generateAsync({ type: 'arraybuffer' }) }),
    ).rejects.toThrow('missing required content');
    expect(replace).not.toHaveBeenCalled();
    expect(await svc.crux.findById(existing.id)).toMatchObject({ title: 'Keep me' });
  });

  it.each(['portrait', 'Mood asset'])(
    'refuses an archive missing a retained %s even when the bytes are locally cached',
    async (kind) => {
      const crux = await svc.crux.create({ title: 'Retained non-file content' });
      const db = getSqliteClient();
      const bytes = new TextEncoder().encode(`Retained ${kind} content`);
      const fingerprint = await hashContent(bytes);
      await db.blobWrite(fingerprint, bytes);
      if (kind === 'portrait')
        await svc.crux.update(crux.id, {
          meta: { authorSnapshots: { previous: { avatarFingerprint: fingerprint } } },
        });
      else
        await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
          'cruxgarden:moodAssets',
          JSON.stringify([{ name: 'Retained image', fingerprint }]),
        ]);
      const archive = await exportGarden();
      const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
      expect(zip.file(`artifacts/${fingerprint}`)).not.toBeNull();
      zip.remove(`artifacts/${fingerprint}`);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      zip.file(
        'manifest.json',
        JSON.stringify({ ...manifest, artifactCount: manifest.artifactCount - 1 }),
      );
      const replace = vi.spyOn(db, 'import');
      await expect(
        importGarden({ data: await zip.generateAsync({ type: 'arraybuffer' }) }),
      ).rejects.toThrow('missing required content');
      expect(replace).not.toHaveBeenCalled();
      expect([...(await db.blobRead(fingerprint))]).toEqual([...bytes]);
    },
  );

  it('requires retained Growth files and author avatars, not just the current Crux files', async () => {
    const snapshot = await svc.crux.create({
      title: 'Retained history',
      type: 'crux',
      kind: 'snapshot',
    });
    const file = await svc.artifact.upload({
      resourceId: snapshot.id,
      blob: new File(['Historical bytes'], 'old.txt'),
      meta: { path: 'old.txt' },
    });
    const avatar = new TextEncoder().encode('Avatar bytes');
    const avatarFingerprint = await hashContent(avatar);
    const db = getSqliteClient();
    await db.blobWrite(avatarFingerprint, avatar);
    await db.run('INSERT INTO authors (id, meta, created, updated) VALUES (?, ?, ?, ?)', [
      'avatar-fixture',
      JSON.stringify({ avatarFingerprint }),
      new Date().toISOString(),
      new Date().toISOString(),
    ]);
    const archive = await exportGarden();
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    zip.remove(`artifacts/${file.fingerprint}`);
    zip.remove(`artifacts/${avatarFingerprint}`);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
    zip.file(
      'manifest.json',
      JSON.stringify({ ...manifest, artifactCount: manifest.artifactCount - 2 }),
    );
    const replace = vi.spyOn(db, 'import');
    await expect(
      importGarden({ data: await zip.generateAsync({ type: 'arraybuffer' }) }),
    ).rejects.toThrow('missing required content (2 blob(s))');
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(['missing', 'corrupted'])(
    'refuses raw database restoration with %s retained content before replacement',
    async (fault) => {
      const incoming = await svc.crux.create({ title: 'Incoming', type: 'workspace' });
      const file = await svc.artifact.upload({
        resourceId: incoming.id,
        blob: new File(['Required bytes'], 'required.txt'),
        meta: { path: 'required.txt' },
      });
      const db = getSqliteClient();
      const image = await db.export();
      const existing = await svc.crux.create({ title: 'Current work', type: 'workspace' });
      if (fault === 'missing') await db.blobDelete(file.fingerprint!);
      else await db.blobWrite(file.fingerprint!, new TextEncoder().encode('Wrong bytes'));
      const replace = vi.spyOn(db, 'import');
      await expect(importGarden({ data: image })).rejects.toThrow(
        fault === 'missing' ? 'missing required content' : 'failed integrity check',
      );
      expect(replace).not.toHaveBeenCalled();
      expect(await svc.crux.findById(existing.id)).toMatchObject({ title: 'Current work' });
    },
  );

  it('verifies staged bytes and refuses a silent content-write corruption', async () => {
    const incoming = await svc.crux.create({ title: 'Incoming', type: 'workspace' });
    await svc.artifact.upload({
      resourceId: incoming.id,
      blob: new File(['Required bytes'], 'required.txt'),
      meta: { path: 'required.txt' },
    });
    const archive = await exportGarden();
    const existing = await svc.crux.create({ title: 'Current work', type: 'workspace' });
    const db = getSqliteClient();
    const write = db.blobWrite.bind(db);
    vi.spyOn(db, 'blobWrite').mockImplementation((fingerprint) =>
      write(fingerprint, new TextEncoder().encode('Short write')),
    );
    const replace = vi.spyOn(db, 'import');
    await expect(importGarden({ data: archive.blob })).rejects.toThrow('failed integrity check');
    expect(replace).not.toHaveBeenCalled();
    expect(await svc.crux.findById(existing.id)).toMatchObject({ title: 'Current work' });
  });

  it('preserves existing records and files when incoming blob writes fail', async () => {
    const incoming = await svc.crux.create({ title: 'Incoming', type: 'workspace' });
    await svc.artifact.upload({
      resourceId: incoming.id,
      blob: new File(['Incoming content'], 'incoming.txt'),
      meta: { path: 'incoming.txt' },
    });
    const archive = await exportGarden();
    const existing = await svc.crux.create({ title: 'Keep me', type: 'workspace' });
    const file = await svc.artifact.upload({
      resourceId: existing.id,
      blob: new File(['Irreplaceable content'], 'keep.txt'),
      meta: { path: 'keep.txt' },
    });
    vi.spyOn(getSqliteClient(), 'blobWrite').mockRejectedValue(new Error('Disk full'));
    await expect(importGarden({ data: archive.blob })).rejects.toThrow('Disk full');
    expect(await svc.crux.findById(existing.id)).toMatchObject({ title: 'Keep me' });
    expect(await (await svc.artifact.downloadBlob(file.id)).text()).toBe('Irreplaceable content');
  });

  it('refuses replacement when its recovery database cannot be captured', async () => {
    const archive = await exportGarden();
    const existing = await svc.crux.create({ title: 'Keep me', type: 'workspace' });
    vi.spyOn(getSqliteClient(), 'export').mockRejectedValue(new Error('Backup unavailable'));
    await expect(importGarden({ data: archive.blob })).rejects.toThrow('Backup unavailable');
    expect(await svc.crux.findById(existing.id)).toMatchObject({ title: 'Keep me' });
  });

  it('restores the previous database when imported session cleanup fails', async () => {
    const archive = await exportGarden();
    const existing = await svc.crux.create({ title: 'Keep me', type: 'workspace' });
    const db = getSqliteClient();
    const run = db.run.bind(db);
    vi.spyOn(db, 'run').mockImplementation((sql, params) => {
      if (sql.startsWith('UPDATE cruxes SET meta = json_remove'))
        return Promise.reject(new Error('Cleanup interrupted'));
      return run(sql, params);
    });
    await expect(importGarden({ data: archive.blob })).rejects.toThrow('Cleanup interrupted');
    expect(await svc.crux.findById(existing.id)).toMatchObject({ title: 'Keep me' });
  });

  it.each(['review', 'cancelled'])(
    'restores a %s journal without a stale live preview or mismatched phase',
    async (phase) => {
      const db = getSqliteClient();
      const crux = await svc.crux.create({ title: 'Imported review', type: 'workspace' });
      const bytes = new TextEncoder().encode('Retained review evidence bytes');
      const fingerprint = await hashContent(bytes);
      await db.blobWrite(fingerprint, bytes);
      const data = {
        id: 'review-id',
        cruxId: crux.id,
        copyId: 'task-id',
        candidateId: 'candidate-id',
        phase: 'review',
        previewUrl: 'http://localhost:12345',
        manifest: { 'kept.txt': { fingerprint } },
        verificationLog: 'Keep this evidence',
      };
      await db.run(
        'INSERT INTO task_merges (id, crux_id, copy_id, candidate_id, phase, data, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          data.id,
          crux.id,
          data.copyId,
          data.candidateId,
          phase,
          JSON.stringify(data),
          new Date().toISOString(),
        ],
      );
      const archive = await exportGarden();
      await importGarden({ data: archive.blob });
      const row = await db.get<{ phase: string; data: string }>(
        'SELECT phase, data FROM task_merges WHERE id = ?',
        [data.id],
      );
      const { previewUrl: _preview, ...preserved } = data;
      expect(row!.phase).toBe('cancelled');
      expect(JSON.parse(row!.data)).toEqual({ ...preserved, phase: 'cancelled' });
    },
  );

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
      await svc.artifact.upload({
        resourceId: cruxA.id,
        blob: new File([content], 'file.txt', { type: 'text/plain' }),
        mimeType: 'text/plain',
        meta: { path: 'file.txt' },
      });
      await svc.artifact.upload({
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

      await expect(importGarden({ data: ab })).rejects.toThrow(
        'Unsupported .garden format version',
      );
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
      const crux = await svc.crux.create({ title: 'Legacy content', type: 'workspace' });
      const file = await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File(['Keep the existing blob'], 'legacy.txt'),
        meta: { path: 'legacy.txt' },
      });
      // Export the current database as raw ArrayBuffer
      const { getSqliteClient } = await import('./sqlite/client');
      const rawSqlite = await getSqliteClient().export();

      // importGarden should detect this as non-ZIP and fall back to legacy import
      const imported = await importGarden({ data: rawSqlite });
      expect(imported.cruxCount).toBeGreaterThanOrEqual(0);
      expect(await (await svc.artifact.downloadBlob(file.id)).text()).toBe(
        'Keep the existing blob',
      );
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
