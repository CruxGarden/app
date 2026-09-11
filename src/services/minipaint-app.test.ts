import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';

beforeEach(() => initServices('local'));
it('preserves native miniPaint layers and raster bytes in Growth and complete Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'miniPaint',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'minipaint-app' },
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
    app: 'minipaint',
    project: {
      info: { width: 200, height: 100, version: '4.14.3' },
      layers: [
        { id: 1, type: 'image', name: 'Picture', width_original: 200, height_original: 100 },
      ],
      data: [
        {
          id: 1,
          data: { __cruxBinary: { path: asset.path, kind: 'blob', type: 'image/png', size: 4 } },
        },
      ],
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
  ).rejects.toThrow('miniPaint');
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify({ version: 1, app: 'minipaint', project: null }),
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

it('scopes agent edits to native layer properties', () => {
  const adapter = embeddedAppToolAdapter({ meta: { template: 'minipaint-app' } })!;
  expect(adapter.prepare('inspect_minipaint', {})).toEqual({ op: 'inspect' });
  expect(adapter.prepare('update_minipaint_layer', { id: 1, opacity: 50 })).toEqual({
    op: 'layer',
    id: 1,
    opacity: 50,
  });
  expect(() =>
    adapter.prepare('update_minipaint_layer', { id: 1, link: 'https://example.com' }),
  ).toThrow();
  expect(() => adapter.prepare('update_minipaint_layer', { id: 1, opacity: NaN })).toThrow();
});
