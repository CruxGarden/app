import { beforeEach, expect, it } from 'vitest';
import { getServices, initServices } from './index';
import { indexedTaskManifest, indexTaskManifest } from './task-files';

beforeEach(() => initServices('local'));

/** Task Working Copies index blobs the store already holds instead of re-reading them (GAME-CRUXSPACE-PLAN.md §9 #7). */
it('registers an existing blob by fingerprint and refuses unknown blobs or duplicate paths', async () => {
  const { crux, artifact } = getServices();
  const main = await crux.create({ title: 'Game', type: 'workspace' });
  const source = await artifact.create({
    resourceId: main.id,
    content: 'console.log("glow")',
    meta: { path: 'runtime/game.js' },
  });
  const task = await crux.create({ title: 'Task copy', type: 'workspace' });
  const registered = await artifact.register({
    resourceId: task.id,
    path: 'runtime/game.js',
    fingerprint: source.fingerprint!,
    size: source.size!,
    mimeType: source.mimeType,
    encoding: source.encoding,
    meta: { path: 'runtime/game.js', mode: 0o644 },
  });
  expect(registered.fingerprint).toBe(source.fingerprint);
  expect(await artifact.readContent(registered.id)).toBe('console.log("glow")');
  await expect(
    artifact.register({
      resourceId: task.id,
      path: 'runtime/game.js',
      fingerprint: source.fingerprint!,
      size: source.size!,
      mimeType: source.mimeType,
      encoding: source.encoding,
    }),
  ).rejects.toThrow('already exists');
  await expect(
    artifact.register({
      resourceId: task.id,
      path: 'runtime/other.js',
      fingerprint: 'a'.repeat(64),
      size: 1,
      mimeType: 'text/javascript',
      encoding: 'utf-8',
    }),
  ).rejects.toThrow('Blob not found');
  // The manifest carries sizes, and indexing a fresh copy registers every file without reading bytes.
  const manifest = await indexedTaskManifest(main.id);
  expect(manifest['runtime/game.js']?.size).toBe(source.size);
  const copy = await crux.create({ title: 'Another copy', type: 'workspace' });
  await indexTaskManifest(copy.id, manifest);
  const files = await artifact.findByResource('crux', copy.id);
  expect(files.map((f) => [f.meta?.path, f.fingerprint])).toEqual([
    ['runtime/game.js', source.fingerprint],
  ]);
});
