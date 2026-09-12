import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { nativeAppType } from './embedded-app';
import { kanCommand } from '@/ai/kan-tools';

beforeEach(() => initServices('local'));
it('keeps original bytes and native records portable while rejecting stale and cross-Crux access', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Board',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'kan-app' },
  });
  expect(nativeAppType(crux)).toBe('kan');
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const original = new Uint8Array([0, 1, 2, 255]);
  const file = (await call({
    op: 'native-import',
    bytes: original.buffer,
    mimeType: 'image/png',
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
    app: 'kan',
    project: {
      state: await encode({
        version: 1,
        cardNumber: 1,
        route: '#/boards',
        preferences: { theme: 'dark' },
      }),
      'record-["kan","board","boardrecord1"]': await encode({
        publicId: 'boardrecord1',
        name: 'Board',
        slug: 'board',
        visibility: 'private',
        isArchived: false,
        favorite: false,
        type: 'regular',
        deletedAt: null,
        workspace: { publicId: 'localspace01', cardPrefix: 'KAN', members: [] },
        labels: [],
        allLists: [],
        lists: [
          {
            publicId: 'listrecord01',
            name: 'Ideas',
            index: 0,
            cards: [
              {
                publicId: 'cardrecord01',
                title: 'Use the image',
                description: '',
                index: 0,
                cardNumber: 1,
                dueDate: null,
                labels: [],
                members: [],
                checklists: [],
                comments: [],
                activities: [],
                attachments: [
                  {
                    publicId: 'attachment01',
                    name: 'pixel.png',
                    type: 'image/png',
                    size: 4,
                    lastModified: 1,
                  },
                ],
              },
            ],
          },
        ],
      }),
      'info-["attachments","attachment01"]': await encode({ name: 'pixel.png', lastModified: 1 }),
      'file-["attachments","attachment01"]': {
        __cruxBinary: { path: file.path, kind: 'buffer', type: 'image/png', size: 4 },
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
    meta: { template: 'kan-app' },
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
it('restricts agent commands to native identities and declared fields', () => {
  expect(kanCommand('create_kan_card', { listPublicId: 'listrecord01', title: 'Ready' })).toEqual({
    op: 'create-card',
    listPublicId: 'listrecord01',
    title: 'Ready',
  });
  expect(kanCommand('inspect_kan', {})).toEqual({ op: 'inspect' });
  expect(() =>
    kanCommand('rename_kan_card', {
      cardPublicId: 'cardrecord01',
      title: 'Ready',
      path: '../outside',
    }),
  ).toThrow();
  expect(() =>
    kanCommand('move_kan_card', {
      cardPublicId: 'cardrecord01',
      listPublicId: 'listrecord01',
      index: -1,
    }),
  ).toThrow();
  expect(() => kanCommand('create_kan_card', { listPublicId: 'bad', title: 'Ready' })).toThrow();
});
