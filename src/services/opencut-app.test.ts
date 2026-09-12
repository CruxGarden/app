import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { nativeAppType } from './embedded-app';
import { opencutCommand } from '@/ai/opencut-tools';

beforeEach(() => initServices('local'));
it('keeps original bytes and native records portable while rejecting stale and cross-Crux access', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Video',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'opencut-app' },
  });
  expect(nativeAppType(crux)).toBe('opencut');
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const original = new Uint8Array([0, 1, 2, 255]);
  const file = (await call({
    op: 'native-import',
    bytes: original.buffer,
    mimeType: 'video/mp4',
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
  const content = JSON.stringify({
    version: 1,
    app: 'opencut',
    project: {
      state: await encode({ route: '#/editor/video-1', preferences: { theme: 'dark' } }),
      'record-["video-editor-projects","projects","video-1"]': await encode({
        metadata: { id: 'video-1', name: 'Video' },
        scenes: [],
      }),
      'info-["media-files-video-1","clip"]': await encode({ name: 'clip.mp4', lastModified: 1 }),
      'file-["media-files-video-1","clip"]': {
        __cruxBinary: { path: file.path, kind: 'buffer', type: 'video/mp4', size: 4 },
      },
    },
  });
  await call({ op: 'write', path: 'project.json', content, expected: null });
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: null }),
  ).rejects.toThrow('changed elsewhere');
  const imported = await importCrux({
    data: (await exportCrux({ cruxId: crux.id })).blob,
    mode: 'clone',
  });
  const clone = await services.crux.findById(imported.cruxId);
  const cloneStore = createCruxStore();
  cloneStore.setState({ crux: clone! });
  const restored = (await notebookSession(cloneStore)({ op: 'native-read', path: file.path })) as {
    bytes: ArrayBuffer;
  };
  expect(new Uint8Array(restored.bytes)).toEqual(original);
  const other = await services.crux.create({
    title: 'Other',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'opencut-app' },
  });
  const otherStore = createCruxStore();
  otherStore.setState({ crux: other });
  await expect(
    notebookSession(otherStore)({ op: 'native-read', path: file.path }),
  ).rejects.toThrow();
  store.setState({ viewingSnapshotId: 'past' });
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: null }),
  ).rejects.toThrow('current app');
});
it('restricts video agent commands to the declared operation and fields', () => {
  expect(opencutCommand('set_opencut_text', { elementId: 'title', content: 'Garden' })).toEqual({
    op: 'set-text',
    elementId: 'title',
    content: 'Garden',
  });
  expect(() => opencutCommand('set_opencut_text', { content: 'Garden' })).toThrow();
  expect(() => opencutCommand('set_opencut_name', { name: 'Video', path: '../outside' })).toThrow();
  expect(() =>
    opencutCommand('set_opencut_text', { elementId: 'title', content: 'x'.repeat(10001) }),
  ).toThrow();
});
