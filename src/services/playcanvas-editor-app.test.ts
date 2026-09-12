import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { nativeAppType } from './embedded-app';
import { playcanvasEditorCommand } from '@/ai/playcanvas-editor-tools';

beforeEach(() => initServices('local'));
it('preserves empty source files, fingerprinted scene components and ownership through export', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Scene',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'playcanvas-editor-app' },
  });
  expect(nativeAppType(crux)).toBe('playcanvas-editor');
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const original = new ArrayBuffer(0);
  const file = (await call({
    op: 'native-import',
    bytes: original,
    mimeType: 'text/javascript',
  })) as { path: string };
  const encode = async (value: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const ref = (await call({
      op: 'native-import',
      bytes: bytes.buffer,
      mimeType: 'application/json',
    })) as { path: string };
    return {
      __cruxBinary: {
        path: ref.path,
        kind: 'buffer',
        type: 'application/json',
        size: bytes.length,
      },
    };
  };
  const document = {
    version: 1,
    app: 'playcanvas-editor',
    project: {
      name: await encode('Scene'),
      scene: await encode({ settings: {}, entities: {} }),
      settings: await encode({}),
      assets: await encode({}),
      'file-1': {
        __cruxBinary: { path: file.path, kind: 'buffer', type: 'text/javascript', size: 0 },
      },
    },
  };
  const content = JSON.stringify(document);
  await call({ op: 'write', path: 'project.json', content, expected: null });
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: null }),
  ).rejects.toThrow('changed elsewhere');
  expect(
    ((await call({ op: 'native-read', path: file.path })) as { bytes: ArrayBuffer }).bytes
      .byteLength,
  ).toBe(0);
  const result = await importCrux({
    data: (await exportCrux({ cruxId: crux.id })).blob,
    mode: 'clone',
  });
  const files = await services.artifact.findByResource('crux', result.cruxId);
  expect(
    await services.artifact.readContent(
      files.find((f) => f.meta?.path === 'data/project.json')!.id,
    ),
  ).toBe(content);
  expect(files.find((f) => f.meta?.path === 'data/' + file.path)?.size).toBe(0);
  await expect(call({ op: 'native-read', path: '../project.json' })).rejects.toThrow();
  store.setState({ viewingSnapshotId: 'past' });
  await expect(
    call({ op: 'native-import', bytes: original, mimeType: 'text/javascript' }),
  ).rejects.toThrow('current app');
});
it('restricts agent writes to named operations and existing entity identifiers', () => {
  expect(
    playcanvasEditorCommand('rename_playcanvas_editor_entity', {
      entityId: 'cube',
      name: 'Lantern',
    }),
  ).toEqual({ op: 'rename-entity', entityId: 'cube', name: 'Lantern' });
  expect(() =>
    playcanvasEditorCommand('rename_playcanvas_editor_entity', { name: 'Lantern' }),
  ).toThrow();
  expect(() =>
    playcanvasEditorCommand('set_playcanvas_editor_name', { name: 'Scene', path: '../outside' }),
  ).toThrow();
});
