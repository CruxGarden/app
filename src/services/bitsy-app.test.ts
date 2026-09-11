import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';

beforeEach(() => initServices('local'));
it('preserves native Bitsy native game data and fonts in Growth and complete Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Bitsy',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'bitsy-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const doc = {
    version: 1,
    app: 'bitsy',
    project: {
      storage: {
        game_data: JSON.stringify('Garden\n\n# BITSY VERSION 8.14\n\nROOM 0\n'),
        custom_font: JSON.stringify({ name: 'test', fontdata: 'FONT test' }),
      },
    },
  };
  const content = JSON.stringify(doc);
  const saved = (await call({ op: 'write', path: 'project.json', content, expected: null })) as {
    fingerprint: string;
  };
  const snapshot = store.getState().growths[0]!.targetId;
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: null }),
  ).rejects.toThrow('changed elsewhere');
  await expect(call({ op: 'native-read', path: '../index.html' })).rejects.toThrow();
  await expect(
    call({
      op: 'write',
      path: 'project.json',
      content: JSON.stringify({ version: 1, app: 'openmosh', local: {}, databases: {} }),
      expected: saved.fingerprint,
    }),
  ).rejects.toThrow('Bitsy');
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify({ version: 1, app: 'bitsy', project: null }),
    expected: saved.fingerprint,
  });
  await store.getState().revertToSnapshot(snapshot);
  expect(((await call({ op: 'read', path: 'project.json' })) as { content: string }).content).toBe(
    content,
  );
  const imported = await importCrux({
    data: (await exportCrux({ cruxId: crux.id })).blob,
    mode: 'clone',
  });
  const files = await services.artifact.findByResource('crux', imported.cruxId);
  expect(
    await services.artifact.readContent(
      files.find((f) => f.meta?.path === 'data/project.json')!.id,
    ),
  ).toBe(content);
});

it('scopes Bitsy agent edits to a title', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'bitsy-app' } })!;
  expect(a.prepare('inspect_bitsy', {})).toEqual({ op: 'inspect' });
  expect(a.prepare('set_bitsy_title', { title: 'Night garden' })).toEqual({
    op: 'title',
    title: 'Night garden',
  });
  expect(() => a.prepare('set_bitsy_title', { title: 'Night garden', room: '0' })).toThrow();
});
