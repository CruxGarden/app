import { beforeEach, expect, it } from 'vitest';
import JSZip from 'jszip';
import { localApiFixture } from '@/test/local-api-fixture';
import { initServices, getServices } from './index';
import { exportCrux, importCrux } from './crux-io';
import { createTask } from './tasks';
import { listWorkingCopies } from './working-copies';
import { getSqliteClient } from './sqlite/client';
import { hashContent } from './sqlite/helpers';
import { getWorkspace, openWorkspace } from '@/stores/workspaceRegistry';

const native = localApiFixture();
beforeEach(() => initServices());
const write = (id: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path: 'index.html' } });
async function read(id: string) {
  const file = (await getServices().artifact.findByResource('crux', id)).find(
    (a) => a.meta?.path === 'index.html',
  )!;
  return getServices().artifact.readContent(file);
}
async function fixture() {
  const main = await getServices().crux.create({ title: 'Project' });
  await write(main.id, 'Archived Main');
  const task = await createTask(main.id, 'Alternative');
  await write(task.id, 'Archived Task');
  await getServices().store.set(main.id, 'count', 1);
  const archive = await exportCrux({ cruxId: main.id });
  await write(main.id, 'Local Main');
  await write(task.id, 'Local Task');
  await getServices().store.set(main.id, 'count', 99);
  return { main, task, archive };
}

it('replaces Main and the Task graph while preserving other open Cruxes and restart', async () => {
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
  await native().restart();
  expect(await read(main.id)).toBe('Archived Main');
  expect(await read(task.id)).toBe('Archived Task');
  expect(await read(other.id)).toBe('Keep me');
});

it('preserves local content, Tasks and Store after an actual import host failure and retries', async () => {
  const { main, task, archive } = await fixture();
  const extra = await createTask(main.id, 'Local-only task');
  const before = await getSqliteClient().all('SELECT * FROM task_merges WHERE crux_id = ?', [
    main.id,
  ]);
  native().failNextImportHost('Disk unavailable');
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
  await native().restart();
  expect(await read(main.id)).toBe('Local Main');
  await importCrux({ data: archive.blob, mode: 'replace' });
  expect(await read(main.id)).toBe('Archived Main');
  expect(await read(task.id)).toBe('Archived Task');
});

it('rejects missing archive3 content before closing or replacing the local graph', async () => {
  const { main, task, archive } = await fixture();
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  zip.remove(Object.keys(zip.files).find((path) => /^content\/[a-f0-9]{64}$/.test(path))!);
  await expect(
    importCrux({ data: await zip.generateAsync({ type: 'blob' }), mode: 'replace' }),
  ).rejects.toThrow('Missing private archive content');
  expect(await read(main.id)).toBe('Local Main');
  expect(await read(task.id)).toBe('Local Task');
  expect(getWorkspace(main.id)).toBeDefined();
});

it('refuses a foreign Task identity without replacing either project', async () => {
  const { main, task, archive } = await fixture();
  const other = await getServices().crux.create({ title: 'Other' });
  await write(other.id, 'Other content');
  const foreign = await createTask(other.id, 'Other Task');
  await write(foreign.id, 'Other Task content');
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  const payload = (await zip.file('graph.json')!.async('text')).replaceAll(task.id, foreign.id);
  zip.file('graph.json', payload);
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('text'));
  zip.file(
    'manifest.json',
    JSON.stringify({ ...manifest, graphFingerprint: await hashContent(payload) }),
  );
  await expect(
    importCrux({ data: await zip.generateAsync({ type: 'blob' }), mode: 'replace' }),
  ).rejects.toThrow('identity already exists');
  expect(await read(main.id)).toBe('Local Main');
  expect(await read(task.id)).toBe('Local Task');
  expect(await read(other.id)).toBe('Other content');
  expect(await read(foreign.id)).toBe('Other Task content');
});

it('rolls back an actual SQLite failure partway through replacement, survives restart and retries', async () => {
  const { main, task, archive } = await fixture();
  await native().faultSql(
    "CREATE TRIGGER refuse_task_removal BEFORE DELETE ON working_copies BEGIN SELECT RAISE(ABORT, 'Interrupted deletion'); END",
  );
  await expect(importCrux({ data: archive.blob, mode: 'replace' })).rejects.toThrow(
    'Interrupted deletion',
  );
  expect(await read(main.id)).toBe('Local Main');
  expect(await read(task.id)).toBe('Local Task');
  expect(await getServices().store.get(main.id, 'count')).toBe(99);
  await native().restart();
  expect(await read(main.id)).toBe('Local Main');
  expect(await read(task.id)).toBe('Local Task');
  await native().faultSql('DROP TRIGGER refuse_task_removal');
  await importCrux({ data: archive.blob, mode: 'replace' });
  expect(await read(main.id)).toBe('Archived Main');
  expect(await read(task.id)).toBe('Archived Task');
  expect(await getServices().store.get(main.id, 'count')).toBe(1);
});
