import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { initServices, type Services } from './index';
import { exportGarden, importGarden, wipeGarden } from './garden-io';
import { hashContent } from './sqlite/helpers';
import { getSqliteClient } from './sqlite/client';
import { localApiFixture } from '@/test/local-api-fixture';
import { growthHostFor } from './growth';
import { createTask, prepareTaskReview } from './tasks';
import { allWorkspaces, closeWorkspace } from '@/stores/workspaceRegistry';

// Exercise the shipped API and native SQLite in an isolated installation.
const native = localApiFixture({ project: true });
async function closeWorkspaces() {
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents: 'discard' });
}

describe('Garden Export / Import', () => {
  let svc: Services;

  beforeEach(async () => {
    svc = await initServices();
  });
  afterEach(() => vi.restoreAllMocks());

  it('refuses a changed cloud owner before installation replacement and permits a fresh retry', async () => {
    const crux = await svc.crux.create({ title: 'Cloud copy' });
    await svc.artifact.create({
      resourceId: crux.id,
      content: 'Backed up',
      meta: { path: 'keep.txt' },
    });
    const archive = await exportGarden();
    await svc.crux.update(crux.id, { title: 'Newer local work' });
    const db = getSqliteClient();
    const replace = vi.spyOn(db, 'import');
    let current = true;
    const guard = () => {
      if (!current) throw new Error('Cloud account changed');
    };
    await expect(
      importGarden({
        data: archive.blob,
        beforeCommit: guard,
        onProgress: (status) => {
          if (status === 'Importing database...') current = false;
        },
      }),
    ).rejects.toThrow('Cloud account changed');
    expect(replace).not.toHaveBeenCalled();
    expect(await svc.crux.findById(crux.id)).toMatchObject({ title: 'Newer local work' });
    await native().restart();
    expect(await svc.crux.findById(crux.id)).toMatchObject({ title: 'Newer local work' });
    current = true;
    await importGarden({ data: archive.blob, beforeCommit: guard });
    expect(await svc.crux.findById(crux.id)).toMatchObject({ title: 'Cloud copy' });
    expect(
      await svc.artifact.readContent((await svc.artifact.findByResource('crux', crux.id))[0]!),
    ).toBe('Backed up');
  });

  it('requires the native installation commands before any export, intake or wipe', async () => {
    const db = getSqliteClient();
    const installation = db.installation;
    db.installation = undefined;
    const exportImage = vi.spyOn(db, 'export');
    const replace = vi.spyOn(db, 'import');
    const rawWrite = vi.spyOn(db, 'run');
    try {
      await expect(exportGarden()).rejects.toThrow(/installation.*unavailable/i);
      await expect(importGarden({ data: new ArrayBuffer(0) })).rejects.toThrow(
        /installation.*unavailable/i,
      );
      await expect(wipeGarden()).rejects.toThrow(/installation.*unavailable/i);
      expect(exportImage).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(rawWrite).not.toHaveBeenCalled();
    } finally {
      db.installation = installation;
    }
  });

  it('refuses export when a retained blob read returns the wrong bytes', async () => {
    const crux = await svc.crux.create({ title: 'Preserve bytes' });
    const file = await svc.artifact.create({
      resourceId: crux.id,
      content: 'Real content',
      meta: { path: 'kept.txt' },
    });
    const db = getSqliteClient();
    const read = db.blobRead.bind(db);
    vi.spyOn(db, 'blobRead').mockImplementation((fp) =>
      fp === file.fingerprint ? Promise.resolve(new TextEncoder().encode('Wrong bytes')) : read(fp),
    );
    await expect(exportGarden()).rejects.toThrow(/integrity|fingerprint/i);
  });

  it('captures incoming buffer bytes before yielding to another caller', async () => {
    const crux = await svc.crux.create({ title: 'Captured input' });
    const archive = await exportGarden();
    const bytes = await archive.blob.arrayBuffer();
    const intake = importGarden({ data: bytes });
    new Uint8Array(bytes).fill(0);
    await intake;
    expect(await svc.crux.findById(crux.id)).toMatchObject({ title: 'Captured input' });
  });

  it('clears retained manifest heads when intentionally wiping the installation', async () => {
    const db = getSqliteClient();
    const crux = await svc.crux.create({ title: 'Retained content' });
    const file = await svc.artifact.create({
      resourceId: crux.id,
      content: 'Retained content',
      meta: { path: 'kept.txt' },
    });
    await (await growthHostFor(crux.id)).snapshot({ label: 'Keep', requestedBy: 'person' });
    const root = file.fingerprint!;
    await wipeGarden();
    expect(await db.all('SELECT * FROM file_content_heads')).toEqual([]);
    expect(await db.blobExists(root)).toBe(false);
  });

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
      await svc.artifact.delete(file);
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
        await db.settings!.put(
          'cruxgarden:moodAssets',
          JSON.stringify([{ name: 'Retained image', fingerprint }]),
        );
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
      type: 'workspace',
    });
    const file = await svc.artifact.upload({
      resourceId: snapshot.id,
      blob: new File(['Historical bytes'], 'old.txt'),
      meta: { path: 'old.txt' },
    });
    await (
      await growthHostFor(snapshot.id)
    ).snapshot({ label: 'Retained history', requestedBy: 'person' });
    await svc.artifact.create({
      resourceId: snapshot.id,
      content: 'Current bytes',
      meta: { path: 'old.txt' },
    });
    const avatar = new TextEncoder().encode('Avatar bytes');
    const avatarFingerprint = await hashContent(avatar);
    const db = getSqliteClient();
    await db.blobWrite(avatarFingerprint, avatar);
    await native().faultSql(
      'INSERT INTO authors (id, meta, created, updated) VALUES (?, ?, ?, ?)',
      [
        crypto.randomUUID(),
        JSON.stringify({ avatarFingerprint }),
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
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
    ).rejects.toThrow(/missing required content/);
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(['missing', 'corrupted'])(
    'rejects raw database input even with %s cached content',
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
      else vi.spyOn(db, 'blobRead').mockResolvedValue(new TextEncoder().encode('Wrong bytes'));
      const replace = vi.spyOn(db, 'import');
      await expect(importGarden({ data: image })).rejects.toThrow('expected a current ZIP archive');
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
    await expect(importGarden({ data: archive.blob })).rejects.toThrow(/integrity|fingerprint/);
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
    expect(await (await svc.artifact.downloadBlob(file)).text()).toBe('Irreplaceable content');
  });

  it('refuses replacement when its recovery database cannot be captured', async () => {
    const archive = await exportGarden();
    const existing = await svc.crux.create({ title: 'Keep me', type: 'workspace' });
    vi.spyOn(getSqliteClient(), 'export').mockRejectedValue(new Error('Backup unavailable'));
    await expect(importGarden({ data: archive.blob })).rejects.toThrow('Backup unavailable');
    expect(await svc.crux.findById(existing.id)).toMatchObject({ title: 'Keep me' });
  });

  it('restores the previous database when imported session cleanup fails', async () => {
    await native().faultSql(
      "CREATE TRIGGER refuse_cleanup BEFORE UPDATE OF meta ON cruxes BEGIN SELECT RAISE(ABORT, 'Cleanup interrupted'); END",
    );
    const guarded = await exportGarden();
    await native().faultSql('DROP TRIGGER refuse_cleanup');
    const existing = await svc.crux.create({ title: 'Keep me', type: 'workspace' });
    const file = await svc.artifact.create({
      resourceId: existing.id,
      content: 'Local work after the backup',
      meta: { path: 'kept.txt' },
    });
    await expect(importGarden({ data: guarded.blob })).rejects.toThrow('Cleanup interrupted');
    expect(await svc.crux.findById(existing.id)).toMatchObject({ title: 'Keep me' });
    expect(await svc.artifact.readContent(file)).toBe('Local work after the backup');
    await native().restart();
    expect(await svc.artifact.readContent(file)).toBe('Local work after the backup');
  });

  it.each(['review', 'cancelled'])(
    'restores a %s journal without a stale live preview or mismatched phase',
    async (phase) => {
      const db = getSqliteClient();
      const crux = await svc.crux.create({ title: 'Imported review', type: 'workspace' });
      await svc.artifact.create({
        resourceId: crux.id,
        content: 'Original',
        meta: { path: 'kept.txt' },
      });
      const task = await createTask(crux.id, 'Review changes');
      await svc.artifact.create({
        resourceId: task.id,
        content: 'Retained review evidence bytes',
        meta: { path: 'kept.txt' },
      });
      const data = await prepareTaskReview(task.id);
      const expected = JSON.stringify(data);
      data.previewUrl = 'http://localhost:12345';
      data.verificationLog = 'Keep this evidence';
      await db.saveTaskReview!(JSON.stringify(data), expected);
      if (phase === 'cancelled')
        await native().faultSql("UPDATE task_merges SET phase = 'cancelled' WHERE id = ?", [
          data.id,
        ]);
      const archive = await exportGarden();
      await closeWorkspaces();
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
    it('exports and re-imports a newly initialized installation', async () => {
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
      expect(manifest.artifactCount).toBeGreaterThanOrEqual(3);

      // Inventory includes manifest objects as well as file bytes.
      const artifactFiles: string[] = [];
      zip.folder('artifacts')?.forEach((path) => artifactFiles.push(path));
      expect(artifactFiles).toHaveLength(manifest.artifactCount);

      // Import back
      const imported = await importGarden({ data: result.blob });
      expect(imported.cruxCount).toBe(1);
      expect(imported.artifactCount).toBe(manifest.artifactCount);
      const files = await svc.artifact.findByResource('crux', crux.id);
      const content = await Promise.all(
        files.map(async (f) => [f.filename, await (await svc.artifact.downloadBlob(f)).text()]),
      );
      expect(content).toEqual(
        expect.arrayContaining([
          ['index.html', '<h1>Hello</h1>'],
          ['style.css', 'body { color: red }'],
        ]),
      );
      await native().restart();
      const reopened = await svc.artifact.findByResource('crux', crux.id);
      expect(
        await Promise.all(
          reopened.map(async (f) => [
            f.filename,
            await (await svc.artifact.downloadBlob(f)).text(),
          ]),
        ),
      ).toEqual(content);
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

    it('marks a current whole-installation backup explicitly', async () => {
      const result = await exportGarden();
      const ab = await result.blob.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));

      expect(manifest.version).toBe('4.0');
      expect(manifest.scope).toBe('installation');
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
      const contentHash = await hashContent(new TextEncoder().encode(content));
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

      // Shared file bytes appear once; each Crux also retains its manifest.
      const artifactFiles: string[] = [];
      zip.folder('artifacts')?.forEach((path) => artifactFiles.push(path));
      expect(artifactFiles.filter((fp) => fp === contentHash)).toHaveLength(1);
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
      manifest.fingerprint = '0'.repeat(64);
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
      zip.file('manifest.json', JSON.stringify({ version: '4.0', scope: 'installation' }));
      const ab = await zip.generateAsync({ type: 'arraybuffer' });

      await expect(importGarden({ data: ab })).rejects.toThrow('missing garden.sqlite');
    });
  });

  describe('current format only', () => {
    it('refuses raw SQLite without replacing existing work', async () => {
      const crux = await svc.crux.create({ title: 'Legacy content', type: 'workspace' });
      const file = await svc.artifact.upload({
        resourceId: crux.id,
        blob: new File(['Keep the existing blob'], 'legacy.txt'),
        meta: { path: 'legacy.txt' },
      });
      // Export the current database as raw ArrayBuffer
      const { getSqliteClient } = await import('./sqlite/client');
      const rawSqlite = await getSqliteClient().export();

      const replace = vi.spyOn(getSqliteClient(), 'import');
      await expect(importGarden({ data: rawSqlite })).rejects.toThrow(
        'expected a current ZIP archive',
      );
      expect(replace).not.toHaveBeenCalled();
      expect(await (await svc.artifact.downloadBlob(file)).text()).toBe('Keep the existing blob');
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
