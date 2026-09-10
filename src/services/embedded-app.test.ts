import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { moqiraPath } from './embedded-app';
import { exportCrux, importCrux } from './crux-io';

beforeEach(() => initServices('local'));
it.each([
  '../project.json',
  '/project.json',
  'notebook/Welcome.md',
  'src/App.tsx',
  'assets/photo.svg',
])('denies Moqira access to %s', (path) => expect(() => moqiraPath(path)).toThrow());
it('saves Moqira as Artifacts, records Growth, rejects stale writes and survives export/import', async () => {
  const store = createCruxStore();
  const crux = await getServices().crux.create({
    title: 'Design',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'moqira' },
  });
  store.setState({ crux });
  const call = notebookSession(store);
  const content = JSON.stringify({
    schemaVersion: 1,
    name: 'Design',
    appearance: {},
    wireframes: [{ id: 'one', name: 'One', nodes: [] }],
  });
  const result = (await call({ op: 'write', path: 'project.json', content, expected: null })) as {
    fingerprint: string;
  };
  expect(store.getState().growths).toHaveLength(1);
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: null }),
  ).rejects.toThrow('changed elsewhere');
  expect(await call({ op: 'read', path: 'project.json' })).toEqual({
    content,
    fingerprint: result.fingerprint,
  });
  store.setState({ viewingSnapshotId: 'past' });
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: result.fingerprint }),
  ).rejects.toThrow('current app');
  store.setState({ viewingSnapshotId: null });
  const exported = await exportCrux({ cruxId: crux.id });
  const imported = await importCrux({ data: exported.blob, mode: 'clone' });
  const copy = await getServices().crux.findById(imported.cruxId);
  expect(copy.meta?.template).toBe('moqira');
  expect(
    (await getServices().artifact.findByResource('crux', copy.id)).some(
      (a) => a.meta?.path === 'mockups/project.json',
    ),
  ).toBe(true);
});
