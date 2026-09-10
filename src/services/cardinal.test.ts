import { beforeEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { cardinalPath } from './embedded-app';
import { exportCrux, importCrux } from './crux-io';
import { appChanges } from './app-changes';
import { publishPipeline } from './publish';
const content = readFileSync(
  new URL('../../cardinal-crux/music/instrument.json', import.meta.url),
  'utf8',
);
beforeEach(() => initServices('local'));
it.each(['../instrument.json', 'runtime/CardinalMini.js', 'starter.vcv', 'notebook/Welcome.md'])(
  'restricts the instrument bridge: %s',
  (path) => expect(() => cardinalPath(path)).toThrow(),
);
it('preserves a Cardinal instrument in Growth and archives, protects ownership and refuses stale or invalid writes', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Slow Sky',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'cardinal-drone' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const result = (await call({
    op: 'write',
    path: 'instrument.json',
    content,
    expected: null,
  })) as { fingerprint: string };
  expect(store.getState().growths).toHaveLength(1);
  await expect(
    call({ op: 'write', path: 'instrument.json', content, expected: null }),
  ).rejects.toThrow('changed elsewhere');
  const invalid = JSON.parse(content);
  invalid.patch.cables[0].inputModuleId = 999;
  await expect(
    call({
      op: 'write',
      path: 'instrument.json',
      content: JSON.stringify(invalid),
      expected: result.fingerprint,
    }),
  ).rejects.toThrow('cable');
  expect(
    ((await call({ op: 'read', path: 'instrument.json' })) as { content: string }).content,
  ).toBe(content);
  const artifacts = await services.artifact.findByResource('crux', crux.id);
  expect(appChanges(crux, [], artifacts)).toEqual({ app: 0, content: 1 });
  const archive = await exportCrux({ cruxId: crux.id });
  const imported = await importCrux({ data: archive.blob, mode: 'clone' });
  const copy = await services.crux.findById(imported.cruxId);
  expect(copy.meta?.template).toBe('cardinal-drone');
  const file = (await services.artifact.findByResource('crux', copy.id)).find(
    (a) => a.meta?.path === 'music/instrument.json',
  )!;
  expect(await services.artifact.readContent(file.id)).toBe(content);
  await expect(publishPipeline(crux, artifacts)).rejects.toThrow('local creation tool');
  store.setState({ viewingSnapshotId: 'past' });
  await expect(
    call({ op: 'write', path: 'instrument.json', content, expected: result.fingerprint }),
  ).rejects.toThrow('current app');
  store.setState({ viewingSnapshotId: null, crux: copy });
  await expect(call({ op: 'read', path: 'instrument.json' })).rejects.toThrow('no longer open');
});
