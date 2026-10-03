import { localApiFixture } from '@/test/local-api-fixture';
import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { copyArtifacts, artifactDestinations } from './copy-artifacts';
import { pathOf } from '@/lib/artifact-path';

const native = localApiFixture();
let gardenId: string;

beforeEach(async () => {
  await initServices();
  gardenId = (await native().client.enterLocalGarden!()).id;
});

it('copies text and binary files independently, retaining originals and destination paths', async () => {
  const { crux, artifact } = getServices();
  const from = await crux.create({ title: 'Sketches', gardenId });
  const to = await crux.create({ title: 'Website', gardenId });
  await artifact.create({
    resourceId: from.id,
    content: 'My caption',
    meta: { path: 'work/caption.txt' },
  });
  await artifact.upload({
    resourceId: from.id,
    blob: new Blob([new Uint8Array([0, 255, 2])]),
    mimeType: 'image/png',
    meta: { path: 'work/drawing.png' },
  });
  const before = await artifact.findByResource('crux', from.id);
  expect(
    await copyArtifacts({
      gardenId,
      sourceId: from.id,
      targetId: to.id,
      paths: before.map(pathOf),
      folder: 'public',
    }),
  ).toEqual(['public/work/caption.txt', 'public/work/drawing.png']);
  const copied = await artifact.findByResource('crux', to.id);
  expect(copied).toHaveLength(2);
  expect(await artifact.readContent(copied[0]!)).toBe('My caption');
  expect(new Uint8Array(await (await artifact.downloadBlob(copied[1]!)).arrayBuffer())).toEqual(
    new Uint8Array([0, 255, 2]),
  );
  expect(await artifact.findByResource('crux', from.id)).toEqual(before);
  await artifact.create({
    resourceId: from.id,
    content: 'Changed original',
    meta: { path: 'work/caption.txt' },
  });
  await native().restart();
  expect(await artifact.readContent(copied[0]!)).toBe('My caption');
});

it('refuses collisions and missing sources before registering any destination files', async () => {
  const { crux, artifact } = getServices();
  const from = await crux.create({ title: 'Source', gardenId });
  const to = await crux.create({ title: 'Destination', gardenId });
  for (const path of ['first.txt', 'second.txt'])
    await artifact.create({ resourceId: from.id, content: path, meta: { path } });
  await artifact.create({ resourceId: to.id, content: 'Keep me', meta: { path: 'SECOND.txt' } });
  const before = await artifact.findByResource('crux', to.id);
  await expect(
    copyArtifacts({
      gardenId,
      sourceId: from.id,
      targetId: to.id,
      paths: ['first.txt', 'second.txt'],
    }),
  ).rejects.toThrow(/already exists/);
  await expect(
    copyArtifacts({
      gardenId,
      sourceId: from.id,
      targetId: to.id,
      paths: ['first.txt', 'gone.txt'],
      folder: 'fresh',
    }),
  ).rejects.toThrow(/no longer available/);
  expect(await artifact.findByResource('crux', to.id)).toEqual(before);
});

it('excludes non-creative destinations and refuses escape paths, self-copies and deleted destinations', async () => {
  const { crux, artifact } = getServices();
  const from = await crux.create({ title: 'Source', gardenId });
  const to = await crux.create({ title: 'Destination', gardenId });
  const tool = await crux.create({ title: 'Tool', kind: 'tool', gardenId });
  await artifact.create({ resourceId: from.id, content: 'hello', meta: { path: 'hello.txt' } });
  const destinations = (await artifactDestinations(gardenId, from.id)).map((c) => c.id);
  expect(destinations).toContain(to.id);
  expect(destinations).not.toContain(tool.id);
  const request = { gardenId, sourceId: from.id, targetId: to.id, paths: ['hello.txt'] };
  await expect(copyArtifacts({ ...request, folder: '../outside' })).rejects.toThrow(/relative/);
  await expect(copyArtifacts({ ...request, targetId: from.id })).rejects.toThrow(/another/);
  await crux.delete(to.id);
  await expect(copyArtifacts(request)).rejects.toThrow(/another/);
});
