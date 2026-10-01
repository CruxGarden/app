import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { copyArtifacts, artifactDestinations } from './copy-artifacts';
import { pathOf } from '@/lib/artifact-path';

beforeEach(async () => {
  await initServices();
});

it('copies text and binary files independently, retaining originals and destination paths', async () => {
  const { crux, artifact } = getServices();
  const from = await crux.create({ title: 'Sketches' });
  const to = await crux.create({ title: 'Website' });
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
  expect(await artifact.readContent(copied[0]!)).toBe('My caption');
});

it('refuses collisions and missing sources before registering any destination files', async () => {
  const { crux, artifact } = getServices();
  const from = await crux.create({ title: 'Source' });
  const to = await crux.create({ title: 'Destination' });
  for (const path of ['first.txt', 'second.txt'])
    await artifact.create({ resourceId: from.id, content: path, meta: { path } });
  await artifact.create({ resourceId: to.id, content: 'Keep me', meta: { path: 'SECOND.txt' } });
  const before = await artifact.findByResource('crux', to.id);
  await expect(
    copyArtifacts({ sourceId: from.id, targetId: to.id, paths: ['first.txt', 'second.txt'] }),
  ).rejects.toThrow(/already exists/);
  await expect(
    copyArtifacts({
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
  const from = await crux.create({ title: 'Source' });
  const to = await crux.create({ title: 'Destination' });
  const tool = await crux.create({ title: 'Tool', kind: 'tool' });
  await artifact.create({ resourceId: from.id, content: 'hello', meta: { path: 'hello.txt' } });
  expect((await artifactDestinations(undefined, from.id)).map((c) => c.id)).not.toContain(tool.id);
  const request = { sourceId: from.id, targetId: to.id, paths: ['hello.txt'] };
  await expect(copyArtifacts({ ...request, folder: '../outside' })).rejects.toThrow(/relative/);
  await expect(copyArtifacts({ ...request, targetId: from.id })).rejects.toThrow(/another/);
  await crux.delete(to.id);
  await expect(copyArtifacts(request)).rejects.toThrow(/another/);
});
