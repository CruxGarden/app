import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { initServices, getServices } from './index';
import { exportCrux, importCrux } from './crux-io';
import { createTask } from './tasks';
import { listWorkingCopies } from './working-copies';
import { getSqliteClient } from './sqlite/client';
import { hashContent } from './sqlite/helpers';
import * as folders from './project-folder';
import {
  allWorkspaces,
  closeWorkspace,
  getWorkspace,
  openWorkspace,
} from '@/stores/workspaceRegistry';

beforeEach(() => initServices());
afterEach(async () => {
  vi.restoreAllMocks();
  for (const workspace of allWorkspaces())
    await closeWorkspace(workspace.id, { stop: true, documents: 'discard' });
});
const write = (id: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path: 'index.html' } });
async function read(id: string) {
  const file = (await getServices().artifact.findByResource('crux', id)).find(
    (a) => a.meta?.path === 'index.html',
  )!;
  return getServices().artifact.readContent(file.id);
}
async function fixture() {
  const main = await getServices().crux.create({ title: 'Project' });
  await write(main.id, 'Archived Main');
  const task = await createTask(main.id, 'Alternative');
  await write(task.id, 'Archived Task');
  await getServices().store.set(main.id, 'count', 1);
  const archive = await exportCrux({ cruxId: main.id, runtime: 'included' });
  await write(main.id, 'Local Main');
  await write(task.id, 'Local Task');
  await getServices().store.set(main.id, 'count', 99);
  return { main, task, archive };
}

it('replaces Main and the Task graph while preserving other open Cruxes', async () => {
  const { main, task, archive } = await fixture();
  const extra = await createTask(main.id, 'Local-only task');
  const other = await getServices().crux.create({ title: 'Other work' });
  await write(other.id, 'Keep me');
  await openWorkspace(other.id);
  await importCrux({ data: archive.blob, mode: 'replace' });
  expect(await read(main.id)).toBe('Archived Main');
  expect(await read(task.id)).toBe('Archived Task');
  expect((await listWorkingCopies(main.id)).map((copy) => copy.id)).toEqual([task.id]);
  expect(
    await getSqliteClient().get('SELECT id FROM working_copies WHERE id = ?', [extra.id]),
  ).toBeUndefined();
  expect(await getServices().store.get(main.id, 'count')).toBe(1);
  expect(await read(other.id)).toBe('Keep me');
  expect(getWorkspace(other.id)).toBeDefined();
});

it('restores exact local content, Tasks and Store after a folder projection failure', async () => {
  const { main, task, archive } = await fixture();
  const extra = await createTask(main.id, 'Local-only task');
  const before = await getSqliteClient().all('SELECT * FROM task_merges WHERE crux_id = ?', [
    main.id,
  ]);
  vi.spyOn(folders, 'projectAllArtifacts').mockRejectedValueOnce(new Error('Disk unavailable'));
  await expect(importCrux({ data: archive.blob, mode: 'replace' })).rejects.toThrow(
    'Disk unavailable',
  );
  expect(await read(main.id)).toBe('Local Main');
  expect(await read(task.id)).toBe('Local Task');
  expect((await listWorkingCopies(main.id)).map((copy) => copy.id)).toEqual(
    expect.arrayContaining([task.id, extra.id]),
  );
  expect(await getServices().store.get(main.id, 'count')).toBe(99);
  expect(
    await getSqliteClient().all('SELECT * FROM task_merges WHERE crux_id = ?', [main.id]),
  ).toEqual(before);
});

it('rejects corrupt contents before closing or replacing the local graph', async () => {
  const { main, task, archive } = await fixture();
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  zip.remove(Object.keys(zip.files).find((path) => /^artifacts\/[a-f0-9]{64}$/.test(path))!);
  await expect(
    importCrux({ data: await zip.generateAsync({ type: 'blob' }), mode: 'replace' }),
  ).rejects.toThrow('missing an Artifact');
  expect(await read(main.id)).toBe('Local Main');
  expect(await read(task.id)).toBe('Local Task');
  expect(getWorkspace(main.id)).toBeDefined();
});

it('refuses foreign row identities without replacing either project', async () => {
  const { main, archive } = await fixture();
  const other = await getServices().crux.create({ title: 'Other' });
  const foreign = await write(other.id, 'Other content');
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  const graph = JSON.parse(await zip.file('tasks.json')!.async('text'));
  graph.artifacts[0].id = foreign.id;
  const payload = JSON.stringify(graph);
  zip.file('tasks.json', payload);
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
  zip.file(
    'manifest.json',
    JSON.stringify({ ...manifest, fingerprint: await hashContent(payload) }),
  );
  await expect(
    importCrux({ data: await zip.generateAsync({ type: 'blob' }), mode: 'replace' }),
  ).rejects.toThrow('other local work');
  expect(await read(main.id)).toBe('Local Main');
  expect(await read(other.id)).toBe('Other content');
});

it('recovers a failure partway through removing the previous graph', async () => {
  const { main, task, archive } = await fixture();
  const db = getSqliteClient();
  const run = db.run.bind(db);
  let injected = false;
  vi.spyOn(db, 'run').mockImplementation(async (sql, params) => {
    if (!injected && sql.startsWith('DELETE FROM working_copies WHERE id IN')) {
      injected = true;
      throw new Error('Interrupted deletion');
    }
    return run(sql, params);
  });
  await expect(importCrux({ data: archive.blob, mode: 'replace' })).rejects.toThrow(
    'Interrupted deletion',
  );
  expect(injected).toBe(true);
  expect(await read(main.id)).toBe('Local Main');
  expect(await read(task.id)).toBe('Local Task');
  expect(await getServices().store.get(main.id, 'count')).toBe(99);
});
