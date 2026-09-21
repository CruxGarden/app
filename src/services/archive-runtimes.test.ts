import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { initServices, getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { exportCrux, importCrux } from './crux-io';
import { exportGarden, importGarden } from './garden-io';
import { createCruxspace } from './cruxspaces';
import { exportCruxspace, importCruxspace } from './cruxspace-package';
import { createTask } from './tasks';
import { closeCruxWorkspaces, allWorkspaces, closeWorkspace } from '@/stores/workspaceRegistry';
import { recordInstalledTool } from './crux-tools/installed';
import { growthHostFor } from './growth';
import { archiveRuntimeMode, rememberRuntimeMode } from './archive-runtimes';

const fixture = vi.hoisted(() => ({ available: true, code: 'const editor = "original";' }));
vi.mock('@/templates', () => ({
  loadTemplate: async () =>
    fixture.available
      ? {
          files: [
            { path: 'runtime/editor.js', content: fixture.code },
            { path: 'data/project.json', content: '{"my":"work"}' },
            { path: 'LICENSE', content: 'Keep this license' },
          ],
        }
      : null,
}));

afterEach(async () => {
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents: 'discard' });
});

beforeEach(async () => {
  await initServices('local');
  fixture.available = true;
  fixture.code = 'const editor = "original";';
  rememberRuntimeMode('reference');
});

async function project() {
  const { crux, artifact } = getServices();
  const c = await crux.create({
    title: 'Portable drawing',
    type: 'workspace',
    kind: 'webapp',
    meta: { template: 'p5-app' },
  });
  const runtime = await artifact.create({
    resourceId: c.id,
    content: fixture.code,
    meta: { path: 'runtime/editor.js' },
  });
  const work = await artifact.create({
    resourceId: c.id,
    content: '{"my":"work"}',
    meta: { path: 'data/project.json' },
  });
  const license = await artifact.create({
    resourceId: c.id,
    content: 'Keep this license',
    meta: { path: 'LICENSE' },
  });
  return { c, runtime, work, license };
}
async function contents(id: string) {
  const files = await getServices().artifact.findByResource('crux', id);
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file.meta?.path,
        await (await getServices().artifact.downloadBlob(file.id)).text(),
      ]),
    ),
  );
}

describe('exact tool references in private archives', () => {
  it('omits unchanged tool bytes, retains the document and license, and restores without source blobs', async () => {
    const { c, runtime, work, license } = await project();
    const result = await exportCrux({ cruxId: c.id });
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
    expect(manifest).toMatchObject({
      version: '3.0',
      baseVersion: '1.0',
      runtimeReferences: [
        { tool: 'p5-app', releaseVersion: '1.0.0', fingerprint: runtime.fingerprint },
      ],
    });
    expect(zip.file('artifacts/' + runtime.fingerprint)).toBeNull();
    expect(zip.file('artifacts/' + work.fingerprint)).not.toBeNull();
    expect(zip.file('artifacts/' + license.fingerprint)).not.toBeNull();
    await getServices().crux.delete(c.id);
    await getSqliteClient().blobWipeAll();
    const imported = await importCrux({ data: result.blob });
    expect(await contents(imported.cruxId)).toMatchObject({
      'runtime/editor.js': fixture.code,
      'data/project.json': '{"my":"work"}',
      LICENSE: 'Keep this license',
    });
  });

  it('keeps a blob that is also used by a personal document', async () => {
    const { c, runtime } = await project();
    await getServices().artifact.create({
      resourceId: c.id,
      content: fixture.code,
      meta: { path: 'data/quotation.txt' },
    });
    const result = await exportCrux({ cruxId: c.id });
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(zip.file('artifacts/' + runtime.fingerprint)).not.toBeNull();
  });

  it('keeps modified tool bytes and preserves the original version in Growth', async () => {
    const { c, runtime } = await project();
    await (await growthHostFor(c.id)).snapshot({ label: 'Original tool', requestedBy: 'person' });
    await getServices().artifact.create({
      resourceId: c.id,
      content: 'my edited tool',
      meta: { path: 'runtime/editor.js' },
    });
    const result = await exportCrux({ cruxId: c.id });
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(zip.file('artifacts/' + runtime.fingerprint)).toBeNull();
    await getServices().crux.delete(c.id);
    await getSqliteClient().blobWipeAll();
    const imported = await importCrux({ data: result.blob });
    expect((await contents(imported.cruxId))['runtime/editor.js']).toBe('my edited tool');
    const growth = await getServices().dimension.findBySourceAndType(imported.cruxId, 'growth');
    expect((await contents(growth[0]!.targetId))['runtime/editor.js']).toBe(fixture.code);
  });

  it('keeps included archives independent of tool availability and remembers the choice', async () => {
    const { c, runtime } = await project();
    rememberRuntimeMode('included');
    expect(archiveRuntimeMode()).toBe('included');
    const result = await exportCrux({ cruxId: c.id });
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(zip.file('artifacts/' + runtime.fingerprint)).not.toBeNull();
    fixture.available = false;
    await getServices().crux.delete(c.id);
    await getSqliteClient().blobWipeAll();
    expect((await importCrux({ data: result.blob })).failedArtifacts).toEqual([]);
  });

  it.each(['missing', 'different'] as const)(
    'rejects a %s tool before replacing local work',
    async (kind) => {
      const { c } = await project();
      const result = await exportCrux({ cruxId: c.id });
      await getServices().artifact.create({
        resourceId: c.id,
        content: 'Keep this local work',
        meta: { path: 'data/project.json' },
      });
      if (kind === 'missing') fixture.available = false;
      else fixture.code = 'a different editor version';
      await expect(importCrux({ data: result.blob, mode: 'replace' })).rejects.toThrow(
        'Install the matching tool',
      );
      expect((await contents(c.id))['data/project.json']).toBe('Keep this local work');
    },
  );

  it.each(['reference', 'included'] as const)(
    'round-trips a Cruxspace with tools %s',
    async (runtime) => {
      const { c } = await project();
      const space = await createCruxspace({ name: 'Studio', brief: '', cruxIds: [c.id] });
      const result = await exportCruxspace({ spaceId: space.id, runtime });
      expect(result.manifest.tools).toEqual([
        { id: 'p5-app', name: 'Sketch', releaseVersion: '1.0.0' },
      ]);
      if (runtime === 'included') fixture.available = false;
      const imported = await importCruxspace({ data: result.blob, mode: 'clone' });
      expect((await contents(imported.members[0]!.id))['runtime/editor.js']).toBe(fixture.code);
    },
  );

  it.each(['reference', 'included'] as const)(
    'round-trips a Garden with tools %s',
    async (runtime) => {
      const { c } = await project();
      const result = await exportGarden({ runtime });
      await getSqliteClient().blobWipeAll();
      if (runtime === 'included') fixture.available = false;
      await importGarden({ data: result.blob });
      expect((await contents(c.id))['runtime/editor.js']).toBe(fixture.code);
    },
  );
  it('restores a Task graph and its independent content from referenced tool files', async () => {
    const { c, runtime } = await project();
    const task = await createTask(c.id, 'Alternative drawing');
    await getServices().artifact.create({
      resourceId: task.id,
      content: 'Task drawing',
      meta: { path: 'data/project.json' },
    });
    const result = await exportCrux({ cruxId: c.id });
    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(JSON.parse(await zip.file('manifest.json')!.async('text'))).toMatchObject({
      version: '3.0',
      baseVersion: '2.0',
    });
    expect(zip.file('artifacts/' + runtime.fingerprint)).toBeNull();
    await closeCruxWorkspaces(c.id, 'save');
    await getServices().crux.delete(c.id);
    await getSqliteClient().blobWipeAll();
    await importCrux({ data: result.blob });
    expect((await contents(c.id))['runtime/editor.js']).toBe(fixture.code);
    expect((await contents(task.id))['data/project.json']).toBe('Task drawing');
  });

  it('resolves an installed tool when its bundled template is unavailable', async () => {
    const { c } = await project();
    const result = await exportCrux({ cruxId: c.id });
    const holder = await getServices().crux.create({
      title: 'Installed Sketch',
      kind: 'tool',
      meta: { template: 'p5-app' },
    });
    await getServices().artifact.create({
      resourceId: holder.id,
      content: fixture.code,
      meta: { path: 'runtime/editor.js' },
    });
    recordInstalledTool({ id: 'p5-app', cruxId: holder.id, installedAt: new Date().toISOString() });
    fixture.available = false;
    const imported = await importCrux({ data: result.blob, mode: 'clone' });
    expect((await contents(imported.cruxId))['runtime/editor.js']).toBe(fixture.code);
  });

  it('refuses a garden backup with unavailable references before wiping local data', async () => {
    const { c } = await project();
    const result = await exportGarden({ runtime: 'reference' });
    await getServices().artifact.create({
      resourceId: c.id,
      content: 'New local work',
      meta: { path: 'data/project.json' },
    });
    fixture.available = false;
    await expect(importGarden({ data: result.blob })).rejects.toThrow('Install the matching tool');
    expect((await contents(c.id))['data/project.json']).toBe('New local work');
  });
});
