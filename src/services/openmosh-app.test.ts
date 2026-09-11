import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { publishPipeline } from './publish';

beforeEach(() => initServices('local'));
it('preserves native OpenMosh sessions and original media through Growth and a complete Crux round trip', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'OpenMosh',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'openmosh-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const bytes = new TextEncoder().encode('original video bytes');
  const asset = (await call({
    op: 'native-import',
    bytes: bytes.buffer,
    mimeType: 'video/webm',
  })) as { path: string; fingerprint: string };
  const document = {
    version: 1,
    app: 'openmosh',
    local: { 'openmosh-settings': '{"lastMode":"single"}' },
    databases: {
      'openmosh-sequence-media': {
        media: [
          {
            id: 'source',
            name: 'clip.webm',
            blob: {
              __cruxBinary: {
                path: asset.path,
                kind: 'blob',
                type: 'video/webm',
                size: bytes.length,
              },
            },
            type: 'video/webm',
            addedAt: 1,
          },
        ],
        sessions: [
          {
            key: 'single:source',
            mode: 'single',
            label: 'clip.webm',
            sourceIds: ['source'],
            state: { effects: [{ defId: 'posterize', values: { levels: 5 } }] },
            updatedAt: 1,
          },
        ],
        pools: [],
        timelines: [],
      },
      'openmosh-tracks': { tracks: [] },
      'openmosh-fonts': { fonts: [] },
    },
  };
  const content = JSON.stringify(document);
  const saved = (await call({ op: 'write', path: 'project.json', content, expected: null })) as {
    fingerprint: string;
  };
  const snapshot = store.getState().growths[0]!.targetId;
  expect(((await call({ op: 'read', path: 'project.json' })) as { content: string }).content).toBe(
    content,
  );
  expect(
    new Uint8Array(
      ((await call({ op: 'native-read', path: asset.path })) as { bytes: ArrayBuffer }).bytes,
    ),
  ).toEqual(bytes);
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: null }),
  ).rejects.toThrow('changed elsewhere');
  await expect(call({ op: 'native-read', path: '../index.html' })).rejects.toThrow();
  const imported = await importCrux({
    data: (await exportCrux({ cruxId: crux.id })).blob,
    mode: 'clone',
  });
  const files = await services.artifact.findByResource('crux', imported.cruxId);
  expect(
    JSON.parse(
      await services.artifact.readContent(
        files.find((f) => f.meta?.path === 'data/project.json')!.id,
      ),
    ),
  ).toEqual(document);
  expect(
    new Uint8Array(
      await (
        await services.artifact.downloadBlob(
          files.find((f) => f.meta?.path === 'data/' + asset.path)!.id,
        )
      ).arrayBuffer(),
    ),
  ).toEqual(bytes);
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify({ ...document, local: {} }),
    expected: saved.fingerprint,
  });
  await store.getState().revertToSnapshot(snapshot);
  expect(((await call({ op: 'read', path: 'project.json' })) as { content: string }).content).toBe(
    content,
  );
  await expect(
    publishPipeline(crux, await services.artifact.findByResource('crux', crux.id)),
  ).rejects.toThrow('Website sharing is not available');
  store.setState({ viewingSnapshotId: 'past' });
  await expect(
    call({ op: 'native-import', bytes: bytes.buffer, mimeType: 'video/webm' }),
  ).rejects.toThrow('current app');
});

it('keeps binary reads and native document references inside the owning Crux', async () => {
  const service = getServices();
  const first = await service.crux.create({
    title: 'One',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'openmosh-app' },
  });
  const second = await service.crux.create({
    title: 'Two',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'openmosh-app' },
  });
  const a = createCruxStore(),
    b = createCruxStore();
  a.setState({ crux: first });
  b.setState({ crux: second });
  const bytes = new TextEncoder().encode('private media');
  const imported = (await notebookSession(a)({
    op: 'native-import',
    bytes: bytes.buffer,
    mimeType: 'image/png',
  })) as { path: string };
  const call = notebookSession(b);
  await expect(call({ op: 'native-read', path: imported.path })).rejects.toThrow('missing');
  const doc = {
    version: 1,
    app: 'openmosh',
    local: {},
    databases: {
      'openmosh-sequence-media': {
        media: [
          {
            id: 'stolen',
            blob: {
              __cruxBinary: {
                path: imported.path,
                type: 'image/png',
                size: bytes.length,
                kind: 'blob',
              },
            },
          },
        ],
      },
    },
  };
  await expect(
    call({ op: 'write', path: 'project.json', expected: null, content: JSON.stringify(doc) }),
  ).rejects.toThrow('Import the original');
  expect(await service.artifact.findByResource('crux', second.id)).toEqual([]);
  await expect(
    call({
      op: 'write',
      path: 'project.json',
      expected: null,
      content: JSON.stringify({ ...doc, databases: { 'other-app': { media: [] } } }),
    }),
  ).rejects.toThrow('Invalid OpenMosh storage');
});
