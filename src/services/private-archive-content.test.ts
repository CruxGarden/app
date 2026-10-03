import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { localApiFixture } from '@/test/local-api-fixture';
import { initServices, getServices } from './index';
import { exportCrux, importCrux } from './crux-io';
import { exportGarden, importGarden } from './garden-io';
import { createCruxspace } from './cruxspaces';
import { exportCruxspace, importCruxspace } from './cruxspace-package';
import { createTask } from './tasks';
import { listWorkingCopies } from './working-copies';
import { growthHostFor } from './growth';
import * as platform from '@/lib/platform';
import { allWorkspaces, closeWorkspace } from '@/stores/workspaceRegistry';

const catalog = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('Tool catalog unavailable');
  }),
);
vi.mock('@/templates', () => ({ loadTemplate: catalog }));
const native = localApiFixture({ project: true });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  catalog.mockClear();
  await initServices();
});
const write = (id: string, path: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path } });
async function contents(id: string) {
  const files = await getServices().artifact.findByResource('crux', id);
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file.meta?.path, await getServices().artifact.readContent(file)]),
    ),
  );
}
async function project() {
  const c = await getServices().crux.create({
    title: 'Portable drawing',
    kind: 'webapp',
    meta: { template: 'p5-app' },
  });
  const runtime = await write(c.id, 'runtime/editor.js', 'const editor = "original";');
  const work = await write(c.id, 'data/project.json', '{"my":"work"}');
  const license = await write(c.id, 'LICENSE', 'Keep this license');
  return { c, runtime, work, license };
}

it('carries editor, work and licenses in archive3 and copies without a tool catalog', async () => {
  const { c, runtime, work, license } = await project();
  const archive = await exportCrux({ cruxId: c.id });
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  const envelope = JSON.parse(await zip.file('manifest.json')!.async('text'));
  expect(envelope).toMatchObject({ archiveVersion: 3, purpose: 'private-backup', graphVersion: 3 });
  expect(envelope).not.toHaveProperty('runtimeReferences');
  for (const file of [runtime, work, license])
    expect(zip.file(`content/${file.fingerprint}`)).not.toBeNull();
  vi.spyOn(platform, 'can').mockImplementation(
    (capability) => capability === platform.Capability.ProjectFolder,
  );
  vi.stubGlobal('window', { electronAPI: { project: { ignoredPaths: vi.fn() } } });
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  expect(await contents(copy.cruxId)).toEqual(await contents(c.id));
  expect(catalog).not.toHaveBeenCalled();
});

it('deduplicates shared runtime/document bytes without omitting either file', async () => {
  const { c, runtime } = await project();
  await write(c.id, 'my-notes.js', 'const editor = "original";');
  const archive = await exportCrux({ cruxId: c.id });
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  expect(
    Object.keys(zip.files).filter((path) => path === `content/${runtime.fingerprint}`),
  ).toHaveLength(1);
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  expect(await contents(copy.cruxId)).toMatchObject({
    'runtime/editor.js': 'const editor = "original";',
    'my-notes.js': 'const editor = "original";',
  });
});

it('keeps modified editor bytes and the exact original editor in marked Growth', async () => {
  const { c } = await project();
  await (
    await growthHostFor(c.id)
  ).snapshot({ label: 'Original drawing tool', requestedBy: 'person' });
  await write(c.id, 'runtime/editor.js', 'const editor = "customized";');
  const archive = await exportCrux({ cruxId: c.id });
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  expect(copy.growthCount).toBe(1);
  expect((await contents(copy.cruxId))['runtime/editor.js']).toBe('const editor = "customized";');
  const versions = await getServices().dimension.findBySourceAndType(copy.cruxId, 'growth');
  expect((await contents(versions[0]!.targetId))['runtime/editor.js']).toBe(
    'const editor = "original";',
  );
  expect(catalog).not.toHaveBeenCalled();
});

it('copies independent Task files and its immutable starting state with remapped owners', async () => {
  const { c } = await project();
  const task = await createTask(c.id, 'Alternative drawing');
  await write(task.id, 'data/project.json', '{"task":"work"}');
  await write(c.id, 'data/project.json', '{"main":"later"}');
  const archive = await exportCrux({ cruxId: c.id });
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  const copiedTask = (await listWorkingCopies(copy.cruxId))[0]!;
  expect(copiedTask.id).not.toBe(task.id);
  expect((await contents(copy.cruxId))['data/project.json']).toBe('{"main":"later"}');
  expect((await contents(copiedTask.id))['data/project.json']).toBe('{"task":"work"}');
  const selection = { cruxId: copy.cruxId, id: copiedTask.id, part: 'base' as const };
  const base = await native().client.inspectTaskHistory!(selection);
  const file = await native().client.readTaskHistoryFile!(
    selection,
    base.root,
    'data/project.json',
  );
  expect(new TextDecoder().decode(new Uint8Array(file!.bytes))).toBe('{"my":"work"}');
  expect(catalog).not.toHaveBeenCalled();
});

it('round-trips a Cruxspace containing tool projects using complete member archives', async () => {
  const { c } = await project();
  const space = await createCruxspace({ name: 'Studio', brief: '', cruxIds: [c.id] });
  const archive = await exportCruxspace({ spaceId: space.id });
  const copy = await importCruxspace({ data: archive.blob, mode: 'clone' });
  expect(await contents(copy.members[0]!.id)).toEqual(await contents(c.id));
  expect(catalog).not.toHaveBeenCalled();
});

it('restores an installation backup with complete tool and Task bytes, then restarts', async () => {
  const { c } = await project();
  const task = await createTask(c.id, 'Alternative drawing');
  await write(task.id, 'data/project.json', '{"task":"work"}');
  const archive = await exportGarden();
  await write(c.id, 'runtime/editor.js', 'Local changes');
  for (const workspace of allWorkspaces())
    await closeWorkspace(workspace.id, { stop: true, documents: 'discard' });
  await importGarden({ data: archive.blob });
  expect((await contents(c.id))['runtime/editor.js']).toBe('const editor = "original";');
  expect((await contents(task.id))['data/project.json']).toBe('{"task":"work"}');
  await native().restart();
  expect((await contents(c.id))['runtime/editor.js']).toBe('const editor = "original";');
  expect((await contents(task.id))['data/project.json']).toBe('{"task":"work"}');
  expect(catalog).not.toHaveBeenCalled();
});

it('refuses an installation backup missing a referenced payload despite an intact local cache', async () => {
  const { c, runtime } = await project();
  const archive = await exportGarden();
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  zip.remove(`artifacts/${runtime.fingerprint}`);
  const envelope = JSON.parse(await zip.file('manifest.json')!.async('text'));
  zip.file(
    'manifest.json',
    JSON.stringify({ ...envelope, artifactCount: envelope.artifactCount - 1 }),
  );
  await write(c.id, 'data/project.json', 'Keep local work');
  await expect(importGarden({ data: await zip.generateAsync({ type: 'blob' }) })).rejects.toThrow(
    /missing|unavailable/i,
  );
  expect((await contents(c.id))['data/project.json']).toBe('Keep local work');
});
