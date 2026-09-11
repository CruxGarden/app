import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';

beforeEach(() => initServices('local'));
it('preserves native Piskel layers and sprite sheet bytes in Growth and complete Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Piskel',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'piskel-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const asset = (await call({
    op: 'native-import',
    bytes: bytes.buffer,
    mimeType: 'image/png',
  })) as { path: string };
  const doc = {
    version: 1,
    app: 'piskel',
    project: {
      modelVersion: 2,
      piskel: {
        name: 'Sprite',
        description: '',
        width: 32,
        height: 32,
        fps: 8,
        layers: [
          {
            name: 'Art',
            opacity: 1,
            frameCount: 1,
            chunks: [
              {
                layout: [[0]],
                base64PNG: {
                  __cruxBinary: { path: asset.path, kind: 'buffer', type: 'image/png', size: 4 },
                },
              },
            ],
          },
        ],
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
  ).rejects.toThrow('Piskel');
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify({ version: 1, app: 'piskel', project: null }),
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
  const raster = await services.artifact.downloadBlob(
    files.find((f) => f.meta?.path === 'data/' + asset.path)!.id,
  );
  expect(new Uint8Array(await raster.arrayBuffer())).toEqual(bytes);
});

it('scopes sprite agent commands to animation speed', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'piskel-app' } })!;
  expect(a.prepare('inspect_piskel', {})).toEqual({ op: 'inspect' });
  expect(a.prepare('set_piskel_speed', { fps: 8 })).toEqual({ op: 'fps', fps: 8 });
  expect(() => a.prepare('set_piskel_speed', { fps: 25 })).toThrow();
  expect(() => a.prepare('set_piskel_speed', { fps: 8, path: '../other' })).toThrow();
});
