import { beforeEach, expect, it } from 'vitest';
import { getServices, initServices } from './index';
import {
  createCruxspace,
  getCruxspace,
  listCruxspaces,
  updateCruxspace,
  deleteCruxspace,
} from './cruxspaces';
import { saveCruxOutput, listCruxspaceAssets, copyCruxspaceAsset } from './cruxspace-assets';
import { exportCrux, importCrux } from './crux-io';
import { createToolExecutor, defaultToolDefinitions, didMutate } from '@/ai/tools';
import { growthHostFor } from './growth';

const png = () =>
  new Blob(
    [
      Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPfkAAAAASUVORK5CYII=',
        ),
        (c) => c.charCodeAt(0),
      ),
    ],
    { type: 'image/png' },
  );

beforeEach(() => initServices('local'));

it('restores imported image and origin together through Growth', async () => {
  const { crux, artifact } = getServices();
  const source = await crux.create({ title: 'Artwork', type: 'workspace' });
  const target = await crux.create({ title: 'Website', type: 'workspace' });
  await artifact.create({
    resourceId: target.id,
    content: '<h1>Release</h1>',
    meta: { path: 'index.html' },
  });
  const growth = await growthHostFor(target.id);
  const before = await growth.snapshot({ label: 'Before artwork', requestedBy: 'person' });
  const space = await createCruxspace({
    name: 'Release',
    brief: '',
    cruxIds: [source.id, target.id],
  });
  const output = await saveCruxOutput(source.id, png(), 'Cover');
  const used = await copyCruxspaceAsset({
    spaceId: space.id,
    outputId: output.id,
    sourceCruxId: source.id,
    fingerprint: output.fingerprint,
    targetCruxId: target.id,
    path: 'assets/cover.png',
  });
  const after = (await growth.list()).at(-1)!;
  await growth.restore(before.id, { requestedBy: 'person' });
  expect(
    (await artifact.findByResource('crux', target.id)).some(
      (f) => f.meta?.path === used.origin.path,
    ),
  ).toBe(false);
  await growth.restore(after.id, { requestedBy: 'person' });
  const files = await artifact.findByResource('crux', target.id);
  expect(files.find((f) => f.meta?.path === used.origin.path)?.fingerprint).toBe(
    output.fingerprint,
  );
  expect(
    JSON.parse(
      await artifact.readContent(files.find((f) => f.meta?.path === used.provenancePath)!.id),
    ),
  ).toEqual(used.origin);
});

it('gives agents member-only briefs and assets, and applies the same scoped transfer', async () => {
  const { crux } = getServices();
  const source = await crux.create({ title: 'Artwork', type: 'workspace' });
  const target = await crux.create({ title: 'Website', type: 'workspace' });
  const space = await createCruxspace({
    name: 'Launch',
    brief: 'Warm autumn colors',
    cruxIds: [source.id, target.id],
  });
  const hidden = await createCruxspace({
    name: 'Private plans',
    brief: 'Unrelated',
    cruxIds: [source.id],
  });
  const output = await saveCruxOutput(source.id, png(), 'Cover');
  const execute = createToolExecutor(target.id);
  expect(defaultToolDefinitions(target.id).map((t) => t.name)).toContain('list_cruxspace_assets');
  const result = JSON.parse((await execute('list_cruxspace_assets', {})) as string);
  expect(result.spaces.map((s: { id: string }) => s.id)).toEqual([space.id]);
  expect(result.spaces[0].brief).toBe('Warm autumn colors');
  expect(await execute('list_cruxspace_assets', { spaceId: hidden.id })).toContain('belong');
  const input = {
    spaceId: space.id,
    sourceCruxId: source.id,
    outputId: output.id,
    fingerprint: output.fingerprint,
    path: 'assets/cover.png',
  };
  const scoped = createToolExecutor(target.id, undefined, undefined, {
    scope: { folder: 'assets' },
  });
  expect(await scoped('use_cruxspace_asset', input)).toContain('scope');
  const used = await execute('use_cruxspace_asset', input);
  expect(didMutate('use_cruxspace_asset', used)).toBe(true);
  expect(JSON.parse(used as string).path).toBe('assets/cover.png');
});

it('keeps named collections independently of open workspaces without duplicating or deleting Cruxes', async () => {
  const crux = await getServices().crux.create({ title: 'Album website', type: 'workspace' });
  const first = await createCruxspace({
    name: 'Album release',
    brief: 'Bring the release together.',
    cruxIds: [crux.id, crux.id],
  });
  const second = await createCruxspace({ name: 'Studio', brief: '', cruxIds: [crux.id] });
  expect((await getCruxspace(first.id)).cruxIds).toEqual([crux.id]);
  expect(await listCruxspaces()).toHaveLength(2);
  await updateCruxspace(first.id, {
    name: 'Autumn release',
    brief: 'Ready for launch.',
    cruxIds: [],
  });
  expect(await getCruxspace(first.id)).toMatchObject({
    name: 'Autumn release',
    brief: 'Ready for launch.',
    cruxIds: [],
  });
  await deleteCruxspace(first.id);
  expect((await listCruxspaces()).map((s) => s.id)).toEqual([second.id]);
  expect((await getServices().crux.listAll()).map((c) => c.id)).toEqual([crux.id]);
});

it('refuses unrelated receivers, stale output versions, traversal and overwrites', async () => {
  const { crux, artifact } = getServices();
  const source = await crux.create({ title: 'Artwork', type: 'workspace' });
  const target = await crux.create({ title: 'Website', type: 'workspace' });
  const outside = await crux.create({ title: 'Other project', type: 'workspace' });
  const space = await createCruxspace({
    name: 'Release',
    brief: '',
    cruxIds: [source.id, target.id],
  });
  const output = await saveCruxOutput(source.id, png(), 'Cover');
  const input = {
    spaceId: space.id,
    outputId: output.id,
    sourceCruxId: source.id,
    fingerprint: output.fingerprint,
    targetCruxId: target.id,
    path: 'assets/cover.png',
  };
  await expect(copyCruxspaceAsset({ ...input, targetCruxId: outside.id })).rejects.toThrow(
    'belong',
  );
  await expect(copyCruxspaceAsset({ ...input, fingerprint: '0'.repeat(64) })).rejects.toThrow(
    'selected version',
  );
  await expect(copyCruxspaceAsset({ ...input, path: '../cover.png' })).rejects.toThrow(
    'relative image path',
  );
  const original = await artifact.upload({
    resourceId: target.id,
    blob: png(),
    meta: { path: input.path },
  });
  await expect(copyCruxspaceAsset(input)).rejects.toThrow('already exists');
  expect((await artifact.findById(original.id)).fingerprint).toBe(original.fingerprint);
  await crux.trash(source.id);
  expect(await listCruxspaceAssets(space.id)).toEqual([]);
});

it('discovers explicit member outputs and copies pinned bytes with portable provenance', async () => {
  const { crux, artifact } = getServices();
  const source = await crux.create({ title: 'Artwork', type: 'workspace' });
  const target = await crux.create({ title: 'Website', type: 'workspace' });
  const other = await crux.create({ title: 'Private work', type: 'workspace' });
  const space = await createCruxspace({
    name: 'Release',
    brief: '',
    cruxIds: [source.id, target.id],
  });
  const output = await saveCruxOutput(source.id, png(), 'Album cover');
  await saveCruxOutput(other.id, png(), 'Unrelated cover');
  const assets = await listCruxspaceAssets(space.id);
  expect(assets.map((a) => a.label)).toEqual(['Album cover']);
  const used = await copyCruxspaceAsset({
    spaceId: space.id,
    outputId: output.id,
    sourceCruxId: source.id,
    fingerprint: output.fingerprint,
    targetCruxId: target.id,
    path: 'assets/cover.png',
  });
  expect(
    new Uint8Array(await (await artifact.downloadBlob(used.artifact.id)).arrayBuffer()),
  ).toEqual(new Uint8Array(await png().arrayBuffer()));
  expect(used.origin).toMatchObject({
    sourceCruxId: source.id,
    fingerprint: output.fingerprint,
    spaceId: space.id,
  });
  await artifact.upload({
    resourceId: source.id,
    blob: new Blob(['changed'], { type: 'image/png' }),
    meta: { path: output.path },
  });
  expect(
    new Uint8Array(await (await artifact.downloadBlob(used.artifact.id)).arrayBuffer()),
  ).toEqual(new Uint8Array(await png().arrayBuffer()));
  await updateCruxspace(space.id, { name: space.name, brief: '', cruxIds: [target.id] });
  expect(await listCruxspaceAssets(space.id)).toEqual([]);
  const clone = await importCrux({
    data: (await exportCrux({ cruxId: target.id })).blob,
    mode: 'clone',
  });
  const files = await artifact.findByResource('crux', clone.cruxId);
  expect(
    files.some((f) => f.meta?.path === 'assets/cover.png' && f.fingerprint === output.fingerprint),
  ).toBe(true);
  const provenance = files.find((f) => f.meta?.path === used.provenancePath)!;
  expect(JSON.parse(await artifact.readContent(provenance.id))).toEqual(used.origin);
});
