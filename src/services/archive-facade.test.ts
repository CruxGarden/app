import { beforeEach, expect, it } from 'vitest';
import JSZip from 'jszip';
import { localApiFixture } from '@/test/local-api-fixture';
import { createLocalApiTestClient } from '@/test/local-api-client';
import { setSqliteClient } from './sqlite/client';
import { useGardenContext } from '@/stores/gardenContext';
import { allWorkspaces, closeWorkspace } from '@/stores/workspaceRegistry';
import { initServices, getServices } from './index';
import { exportCrux, importCrux, peekImport, exportArtifactsZip } from './crux-io';
import { growthHostFor } from './growth';

const native = localApiFixture();
beforeEach(() => initServices());
const write = (id: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path: 'notes/hello.txt' } });
async function text(id: string) {
  const file = (await getServices().artifact.findByResource('crux', id)).find(
    (file) => file.meta?.path === 'notes/hello.txt',
  )!;
  return getServices().artifact.readContent(file);
}
async function destination<T>(action: () => Promise<T>) {
  for (const workspace of allWorkspaces())
    await closeWorkspace(workspace.id, { stop: true, documents: 'discard' });
  const target = await createLocalApiTestClient();
  try {
    setSqliteClient(target.client);
    useGardenContext.getState().initialize(await target.client.enterLocalGarden!());
    return await action();
  } finally {
    await target.client.close();
    setSqliteClient(native().client);
    useGardenContext.getState().initialize(await native().client.enterLocalGarden!());
  }
}

it('detects an existing Crux and reports actual marked version counts', async () => {
  const c = await getServices().crux.create({ title: 'Existing work' });
  await write(c.id, 'First');
  const host = await growthHostFor(c.id);
  await host.snapshot({ label: 'First', requestedBy: 'person' });
  await write(c.id, 'Second');
  await host.snapshot({ label: 'Second', requestedBy: 'person' });
  const archive = await exportCrux({ cruxId: c.id });
  expect((await peekImport(archive.blob)).conflict).toMatchObject({
    title: 'Existing work',
    installedVersion: 2,
    incomingVersion: 2,
  });
});

it('does not treat an actual database read refusal as an absent Crux', async () => {
  const c = await getServices().crux.create({ title: 'Keep me' });
  await write(c.id, 'Keep local work');
  const archive = await exportCrux({ cruxId: c.id });
  await native().faultSql('ALTER TABLE cruxes RENAME TO temporarily_unavailable_cruxes');
  try {
    await expect(peekImport(archive.blob)).rejects.toThrow(/no such table/i);
  } finally {
    await native().faultSql('ALTER TABLE temporarily_unavailable_cruxes RENAME TO cruxes');
  }
  expect(await text(c.id)).toBe('Keep local work');
  expect((await peekImport(archive.blob)).conflict).not.toBeNull();
});

it('restores exact identity and binary/text files into a clean destination and replays idempotently', async () => {
  const c = await getServices().crux.create({ title: 'Portable work' });
  await write(c.id, 'Hello');
  const binary = await getServices().artifact.upload({
    resourceId: c.id,
    blob: new Blob([new Uint8Array([0, 255, 42])]),
    meta: { path: 'assets/photo.bin' },
    mimeType: 'application/octet-stream',
  });
  const archive = await exportCrux({ cruxId: c.id });
  await destination(async () => {
    expect((await peekImport(archive.blob)).conflict).toBeNull();
    const requestId = crypto.randomUUID();
    const first = await importCrux({ data: archive.blob, mode: 'restore', requestId });
    expect(first.cruxId).toBe(c.id);
    expect(await text(c.id)).toBe('Hello');
    const file = (await getServices().artifact.findByResource('crux', c.id)).find(
      (file) => file.meta?.path === 'assets/photo.bin',
    )!;
    expect(file.fingerprint).toBe(binary.fingerprint);
    expect(
      new Uint8Array(await (await getServices().artifact.downloadBlob(file)).arrayBuffer()),
    ).toEqual(new Uint8Array([0, 255, 42]));
    await write(c.id, 'Later work');
    expect((await importCrux({ data: archive.blob, mode: 'restore', requestId })).cruxId).toBe(
      c.id,
    );
    expect(await text(c.id)).toBe('Later work');
  });
});

it('copies Store public/protected visitor values and presentation metadata without changing the original', async () => {
  const c = await getServices().crux.create({
    title: 'My creation',
    meta: {
      layout: { paneOrder: ['workshop', 'growth'] },
      theme: { mode: 'dark' },
      custom: { extension: 'keep' },
    },
  });
  await write(c.id, 'Content');
  const firstVisitor = crypto.randomUUID();
  const secondVisitor = crypto.randomUUID();
  const store = getServices().store;
  await store.set(c.id, 'views', 42, 'public');
  await store.set(c.id, 'prefs', { color: 'red' }, 'protected', firstVisitor);
  await store.set(c.id, 'prefs', { color: 'blue' }, 'protected', secondVisitor);
  const archive = await exportCrux({ cruxId: c.id });
  const copy = await importCrux({ data: archive.blob, mode: 'clone' });
  expect(copy.cruxId).not.toBe(c.id);
  expect(copy.layout).toEqual(c.meta?.layout);
  expect(copy.theme).toEqual(c.meta?.theme);
  expect((await getServices().crux.findById(copy.cruxId)).meta?.custom).toEqual({
    extension: 'keep',
  });
  expect(await store.get(copy.cruxId, 'views')).toBe(42);
  expect(await store.get(copy.cruxId, 'prefs', firstVisitor)).toEqual({ color: 'red' });
  expect(await store.get(copy.cruxId, 'prefs', secondVisitor)).toEqual({ color: 'blue' });
  await store.set(copy.cruxId, 'views', 99, 'public');
  expect(await store.get(c.id, 'views')).toBe(42);
});

it('copies both children of a restored marked version with remapped ancestry and exact contents', async () => {
  const c = await getServices().crux.create({ title: 'Two directions' });
  const host = await growthHostFor(c.id);
  await write(c.id, 'Starting point');
  const start = await host.snapshot({ label: 'Start', requestedBy: 'person' });
  await write(c.id, 'First direction');
  await host.snapshot({ label: 'First', requestedBy: 'person' });
  await host.restore(start.id, { requestedBy: 'person' });
  await write(c.id, 'Second direction');
  await host.snapshot({ label: 'Second', requestedBy: 'person' });
  const copy = await importCrux({ data: (await exportCrux({ cruxId: c.id })).blob, mode: 'clone' });
  const versions = await getServices().dimension.findBySourceAndType(copy.cruxId, 'growth');
  const labeled = new Map(versions.map((version) => [version.meta?.label, version.targetId]));
  const a = labeled.get('Start')!;
  const b = labeled.get('First')!;
  const d = labeled.get('Second')!;
  expect(a).not.toBe(start.id);
  expect((await getServices().crux.findById(b)).meta?.parentCruxId).toBe(a);
  expect((await getServices().crux.findById(d)).meta?.parentCruxId).toBe(a);
  expect(await text(a)).toBe('Starting point');
  expect(await text(b)).toBe('First direction');
  expect(await text(d)).toBe('Second direction');
});

it('exports selected Artifact ZIPs with exact paths and bytes', async () => {
  const c = await getServices().crux.create({ title: 'Files' });
  const a = await write(c.id, 'Hello');
  const archive = await exportArtifactsZip({ cruxSlug: c.slug, artifacts: [a] });
  expect(archive.failed).toEqual([]);
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  expect(await zip.file('notes/hello.txt')!.async('text')).toBe('Hello');
  expect(zip.file('graph.json')).toBeNull();
});

it('refuses unavailable API archive transport instead of exporting a different format', async () => {
  const c = await getServices().crux.create({ title: 'Keep work' });
  const api = native().client.privateArchive;
  native().client.privateArchive = undefined;
  try {
    await expect(exportCrux({ cruxId: c.id })).rejects.toThrow(/unavailable/i);
    await expect(importCrux({ data: new Blob(), mode: 'clone' })).rejects.toThrow(/unavailable/i);
  } finally {
    native().client.privateArchive = api;
  }
});
