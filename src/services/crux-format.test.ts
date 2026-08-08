import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { initServices, type Services } from './index';
import { exportCrux, importCrux } from './crux-io';
import { hashContent } from './sqlite/helpers';

/**
 * .crux format CONFORMANCE tests — verifies the archive against the promises
 * in CRUX-FORMAT.md (content-addressing, integrity, counts, fallbacks, store
 * data, DAG history), complementing the round-trip suite in
 * export-import.test.ts. Real SQLite via TestSqliteClient, no mocks.
 */

async function zipOf(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

/** Repack a zip after tampering. */
async function repack(zip: JSZip): Promise<ArrayBuffer> {
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('.crux format conformance (CRUX-FORMAT.md)', () => {
  let svc: Services;

  beforeEach(async () => {
    svc = await initServices('local');
  });

  /** A workspace with 2 files, and optionally snapshots that share content. */
  async function makeWorkspace() {
    const crux = await svc.crux.create({
      title: 'Format Crux',
      slug: 'format-crux',
      type: 'workspace',
    });
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
    return crux;
  }

  async function makeSnapshot(workspaceId: string, weight: number, parentCruxId: string | null) {
    const snap = await svc.crux.create({
      slug: `snapshot-${weight}-${Date.now().toString(36)}`,
      title: `Snapshot ${weight}`,
      type: 'crux',
      kind: 'snapshot',
      meta: { messages: [{ role: 'user', content: `segment ${weight}` }], parentCruxId },
    });
    await svc.artifact.cloneArtifactsToSnapshot(workspaceId, snap.id);
    await svc.dimension.create({
      sourceId: workspaceId,
      targetId: snap.id,
      type: 'growth',
      weight,
    });
    return snap;
  }

  // ── Content-addressable storage ───────────────────────────────────────────

  it('every blob in artifacts/ is named by the SHA-256 of its bytes (integrity by construction)', async () => {
    const crux = await makeWorkspace();
    await makeSnapshot(crux.id, 1, null);
    const result = await exportCrux({ cruxId: crux.id });
    const zip = await zipOf(result.blob);

    const blobFiles: { name: string; entry: JSZip.JSZipObject }[] = [];
    zip.folder('artifacts')!.forEach((relativePath, entry) => {
      if (!entry.dir) blobFiles.push({ name: relativePath, entry });
    });
    expect(blobFiles.length).toBeGreaterThan(0);

    for (const { name, entry } of blobFiles) {
      const bytes = new Uint8Array(await entry.async('arraybuffer'));
      const actual = await hashContent(bytes);
      expect(actual).toBe(name); // the filename IS the fingerprint
      expect(name).toMatch(/^[0-9a-f]{64}$/); // hex sha-256, no extension
    }
  });

  it('deduplicates: snapshots sharing content produce one blob; manifest.artifactCount is the deduped count', async () => {
    const crux = await makeWorkspace();
    // Two snapshots cloned from identical workspace content — same fingerprints
    await makeSnapshot(crux.id, 1, null);
    await makeSnapshot(crux.id, 2, null);

    const result = await exportCrux({ cruxId: crux.id });
    const zip = await zipOf(result.blob);

    // Collect every fingerprint referenced by any version manifest
    const referenced = new Set<string>();
    const versionFiles: string[] = [];
    zip.folder('versions')!.forEach((rel, entry) => {
      if (!entry.dir) versionFiles.push(`versions/${rel}`);
    });
    for (const vf of versionFiles) {
      const manifest = JSON.parse(await zip.file(vf)!.async('text'));
      for (const info of Object.values(manifest.artifacts || {}) as { fingerprint: string }[]) {
        referenced.add(info.fingerprint);
      }
    }

    const blobNames: string[] = [];
    zip.folder('artifacts')!.forEach((rel, entry) => {
      if (!entry.dir) blobNames.push(rel);
    });

    // 2 unique contents (index.html + style.css) shared across 3 versions
    expect(blobNames.sort()).toEqual([...referenced].sort());
    expect(blobNames).toHaveLength(2);

    const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
    expect(manifest.artifactCount).toBe(2);
    expect(manifest.snapshotCount).toBe(2);
  });

  // ── Archive integrity fingerprint ─────────────────────────────────────────

  it('manifest.fingerprint is reproducible from the archive alone (documented formula)', async () => {
    const crux = await makeWorkspace();
    await makeSnapshot(crux.id, 1, null);
    const result = await exportCrux({ cruxId: crux.id });
    const zip = await zipOf(result.blob);

    const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
    const cruxJsonText = await zip.file('crux.json')!.async('text');
    const dimensionsText = await zip.file('dimensions.json')!.async('text');
    const current = JSON.parse(await zip.file('versions/current.json')!.async('text'));
    const currentSnapshotFingerprint = current.crux.meta.fingerprint;

    const recomputed = await hashContent(
      [currentSnapshotFingerprint, cruxJsonText, dimensionsText].join('\n'),
    );
    expect(recomputed).toBe(manifest.fingerprint);
  });

  // ── Manifest validation rules ─────────────────────────────────────────────

  it('accepts any 1.x version, rejects other majors and a missing version', async () => {
    const crux = await makeWorkspace();
    const result = await exportCrux({ cruxId: crux.id });

    const baseline = JSON.parse(
      await (await zipOf(result.blob)).file('manifest.json')!.async('text'),
    );
    expect(baseline.version).toMatch(/^1\./); // the shipped wire version is 1.x

    async function withVersion(version: unknown): Promise<ArrayBuffer> {
      const zip = await zipOf(result.blob);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
      if (version === undefined) delete manifest.version;
      else manifest.version = version;
      zip.file('manifest.json', JSON.stringify(manifest));
      return repack(zip);
    }

    await svc.crux.delete(crux.id);
    const ok = await importCrux({ data: await withVersion('1.99') });
    expect(ok.cruxId).toBeDefined();
    await svc.crux.delete(ok.cruxId);

    await expect(importCrux({ data: await withVersion('2.0') })).rejects.toThrow(/version/i);
    await expect(importCrux({ data: await withVersion(undefined) })).rejects.toThrow(/version/i);
  });

  it('rejects an archive without crux.json', async () => {
    const crux = await makeWorkspace();
    const result = await exportCrux({ cruxId: crux.id });
    const zip = await zipOf(result.blob);
    zip.remove('crux.json');
    await expect(importCrux({ data: await repack(zip) })).rejects.toThrow(/crux\.json/);
  });

  // ── Graceful fallbacks ────────────────────────────────────────────────────

  it('missing dimensions.json: snapshots still restore with sequential growth dimensions', async () => {
    const crux = await makeWorkspace();
    await makeSnapshot(crux.id, 1, null);
    await makeSnapshot(crux.id, 2, null);
    const result = await exportCrux({ cruxId: crux.id });

    const zip = await zipOf(result.blob);
    zip.remove('dimensions.json');
    await svc.crux.delete(crux.id);

    const imported = await importCrux({ data: await repack(zip), mode: 'clone' });
    const growths = await svc.dimension.findBySourceAndType(imported.cruxId, 'growth');
    expect(growths).toHaveLength(2);
    const weights = growths.map((g) => g.weight).sort();
    expect(weights).toEqual([1, 2]);
  });

  it('missing versions/ directory: workspace imports with zero snapshots', async () => {
    const crux = await makeWorkspace();
    const result = await exportCrux({ cruxId: crux.id });

    const zip = await zipOf(result.blob);
    const toRemove: string[] = [];
    zip.folder('versions')!.forEach((rel) => toRemove.push(`versions/${rel}`));
    for (const f of toRemove) zip.remove(f);
    zip.remove('versions');
    await svc.crux.delete(crux.id);

    const imported = await importCrux({ data: await repack(zip) });
    expect(imported.growthCount).toBe(0);
    const growths = await svc.dimension.findBySourceAndType(imported.cruxId, 'growth');
    expect(growths).toHaveLength(0);
  });

  it('missing/empty title defaults to "Imported Crux"', async () => {
    const crux = await makeWorkspace();
    const result = await exportCrux({ cruxId: crux.id });

    const zip = await zipOf(result.blob);
    const cruxJson = JSON.parse(await zip.file('crux.json')!.async('text'));
    cruxJson.title = '';
    zip.file('crux.json', JSON.stringify(cruxJson));
    await svc.crux.delete(crux.id);

    const imported = await importCrux({ data: await repack(zip) });
    expect(imported.title).toBe('Imported Crux');
  });

  // ── store.json ────────────────────────────────────────────────────────────

  it('round-trips Crux Store entries, remapped to the imported crux id', async () => {
    const crux = await makeWorkspace();
    await svc.store.set(crux.id, 'views', 42, 'public');
    await svc.store.set(crux.id, 'prefs', { theme: 'dark' }, 'protected');

    const result = await exportCrux({ cruxId: crux.id });

    // The archive carries the entries
    const zip = await zipOf(result.blob);
    const storeJson = JSON.parse(await zip.file('store.json')!.async('text'));
    expect(storeJson).toHaveLength(2);

    // Clone: entries must attach to the NEW crux id, not the original
    const imported = await importCrux({ data: result.blob, mode: 'clone' });
    expect(imported.cruxId).not.toBe(crux.id);
    const entries = await svc.store.list(imported.cruxId);
    const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
    expect(byKey.views!.value).toBe(42);
    expect(byKey.views!.mode).toBe('public');
    expect(byKey.prefs!.value).toEqual({ theme: 'dark' });
    expect(byKey.prefs!.mode).toBe('protected');
  });

  it('omits store.json entirely when the crux has no store data', async () => {
    const crux = await makeWorkspace();
    const result = await exportCrux({ cruxId: crux.id });
    const zip = await zipOf(result.blob);
    expect(zip.file('store.json')).toBeNull();
  });

  // ── layout / theme passthrough ────────────────────────────────────────────

  it('passes crux.json layout and theme through to the import result', async () => {
    const crux = await makeWorkspace();
    const result = await exportCrux({ cruxId: crux.id });

    const zip = await zipOf(result.blob);
    const cruxJson = JSON.parse(await zip.file('crux.json')!.async('text'));
    cruxJson.layout = {
      paneOrder: ['collaboration', 'workshop'],
      paneVisibility: { workshop: true },
    };
    cruxJson.theme = { mode: 'dark', tint: 'green' };
    zip.file('crux.json', JSON.stringify(cruxJson));
    await svc.crux.delete(crux.id);

    const imported = await importCrux({ data: await repack(zip) });
    expect(imported.layout?.paneOrder).toEqual(['collaboration', 'workshop']);
    expect(imported.theme).toEqual({ mode: 'dark', tint: 'green' });
  });

  // ── Filename convention ───────────────────────────────────────────────────

  it('names exports {slug}-{YYYYMMDDHHmm}.crux', async () => {
    // (The documented "crux" fallback is defensive only — the crux service
    // always derives a slug from the title, so it's unreachable through the
    // service layer.)
    const crux = await makeWorkspace();
    const result = await exportCrux({ cruxId: crux.id });
    expect(result.filename).toMatch(/^format-crux-\d{12}\.crux$/);
  });

  // ── Branched (DAG) history ────────────────────────────────────────────────

  it('preserves a BRANCHED history: two snapshots sharing one parent survive a clone', async () => {
    const crux = await makeWorkspace();
    const snapA = await makeSnapshot(crux.id, 1, null);
    await makeSnapshot(crux.id, 2, snapA.id); // branch 1
    await makeSnapshot(crux.id, 3, snapA.id); // branch 2 — same parent (DAG, not a chain)

    const result = await exportCrux({ cruxId: crux.id });

    // In the archive: both children point at parentIndex 0
    const zip = await zipOf(result.blob);
    const v1 = JSON.parse(await zip.file('versions/1.json')!.async('text'));
    const v2 = JSON.parse(await zip.file('versions/2.json')!.async('text'));
    expect(v1.parentIndex).toBe(0);
    expect(v2.parentIndex).toBe(0);

    // Clone (all UUIDs regenerate) — the index-based mapping must rebuild the DAG
    const imported = await importCrux({ data: result.blob, mode: 'clone' });
    const growths = (await svc.dimension.findBySourceAndType(imported.cruxId, 'growth')).sort(
      (a, b) => (a.weight ?? 0) - (b.weight ?? 0),
    );
    expect(growths).toHaveLength(3);

    const newA = await svc.crux.findById(growths[0]!.targetId);
    const newB = await svc.crux.findById(growths[1]!.targetId);
    const newC = await svc.crux.findById(growths[2]!.targetId);
    expect(newA.id).not.toBe(snapA.id); // clone regenerated snapshot IDs
    expect(newB.meta?.parentCruxId).toBe(newA.id);
    expect(newC.meta?.parentCruxId).toBe(newA.id);
  });

  // ── The version fingerprint primitive ─────────────────────────────────────

  it('computeSnapshotFingerprint is deterministic and sensitive to content and paths', async () => {
    const crux = await makeWorkspace();

    const fp1 = await svc.artifact.computeSnapshotFingerprint(crux.id);
    const fp2 = await svc.artifact.computeSnapshotFingerprint(crux.id);
    expect(fp1).toBe(fp2); // deterministic

    // Content change changes the fingerprint
    await svc.artifact.create({
      resourceId: crux.id,
      content: '<h1>Changed</h1>',
      mimeType: 'text/html',
      meta: { path: 'index.html' },
    });
    const fp3 = await svc.artifact.computeSnapshotFingerprint(crux.id);
    expect(fp3).not.toBe(fp1);

    // A rename (same content, new path) also changes it
    const artifacts = await svc.artifact.findByResource('crux', crux.id);
    const css = artifacts.find((a) => a.meta?.path === 'style.css')!;
    await svc.artifact.update(css.id, { meta: { path: 'styles/main.css' } });
    const fp4 = await svc.artifact.computeSnapshotFingerprint(crux.id);
    expect(fp4).not.toBe(fp3);
  });

  it('a write to a renamed path updates the artifact in place (no duplicate row)', async () => {
    // Regression: update() must sync the internal path column with meta.path,
    // or the post-rename dedup lookup misses and a duplicate row appears.
    const crux = await makeWorkspace();
    const artifacts = await svc.artifact.findByResource('crux', crux.id);
    const css = artifacts.find((a) => a.meta?.path === 'style.css')!;

    await svc.artifact.update(css.id, { meta: { path: 'styles/main.css' } });
    await svc.artifact.create({
      resourceId: crux.id,
      content: 'body { color: blue }',
      mimeType: 'text/css',
      meta: { path: 'styles/main.css' },
    });

    const after = await svc.artifact.findByResource('crux', crux.id);
    const cssRows = after.filter((a) => (a.meta?.path as string)?.endsWith('.css'));
    expect(cssRows).toHaveLength(1);
    expect(cssRows[0]!.id).toBe(css.id);
    expect(cssRows[0]!.filename).toBe('main.css'); // filename follows the rename
    expect(await (await svc.artifact.downloadBlob(css.id)).text()).toBe('body { color: blue }');
  });
});
