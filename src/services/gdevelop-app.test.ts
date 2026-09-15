import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { GDEVELOP_TOOLS } from '@/ai/gdevelop-tools';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';
beforeEach(() => initServices('local'));
it('retains native scenes, events and original-media components through Growth and portable Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Research',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'gdevelop-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const components = {
    document: {
      properties: { name: 'Game' },
      layouts: [
        {
          name: 'Scene',
          objects: [{ name: 'Player', type: 'Sprite' }],
          events: [{ type: 'BuiltinCommonInstructions::Standard', conditions: [], actions: [] }],
        },
      ],
    },
    preferences: { 'gd-preferences': '{}' },
    ['media-' + 'b'.repeat(64)]: { type: 'image/png', bytes: 'aGVsbG8=' },
  };
  const project: Record<string, unknown> = {};
  const assets: { path: string; bytes: Uint8Array }[] = [];
  for (const [key, value] of Object.entries(components)) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const asset = (await call({
      op: 'native-import',
      bytes: bytes.buffer,
      mimeType: 'application/json',
    })) as { path: string };
    project[key] = {
      __cruxBinary: {
        path: asset.path,
        kind: 'buffer',
        type: 'application/json',
        size: bytes.byteLength,
      },
    };
    assets.push({ path: asset.path, bytes });
  }
  const doc = { version: 1, app: 'gdevelop', project };
  const content = JSON.stringify(doc);
  const saved = (await call({ op: 'write', path: 'project.json', content, expected: null })) as {
    fingerprint: string;
  };
  const snapshot = store.getState().growths[0]!.targetId;
  await expect(
    call({ op: 'write', path: 'project.json', content, expected: null }),
  ).rejects.toThrow('changed elsewhere');
  await expect(call({ op: 'native-read', path: '../other' })).rejects.toThrow();
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify({
      version: 1,
      app: 'gdevelop',
      project: null,
    }),
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
  for (const asset of assets) {
    const data = await services.artifact.downloadBlob(
      files.find((f) => f.meta?.path === 'data/' + asset.path)!.id,
    );
    expect(new Uint8Array(await data.arrayBuffer())).toEqual(asset.bytes);
  }
});

it('limits agent edits to existing scene parameters and bounded names', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'gdevelop-app' } })!;
  expect(a.prepare('set_gdevelop_background', { scene: 'Scene', rgb: [32, 48, 64] })).toEqual({
    op: 'set-background',
    scene: 'Scene',
    rgb: [32, 48, 64],
  });
  expect(() =>
    a.prepare('set_gdevelop_background', { scene: 'Scene', rgb: [256, 0, 0] }),
  ).toThrow();
  expect(() => a.prepare('set_gdevelop_name', { name: 'x', code: 'run()' })).toThrow();
  expect(() => a.prepare('set_gdevelop_name', { name: 'x'.repeat(201) })).toThrow();
});

it('exposes read-only native inspection and metadata with bounded, strict inputs', () => {
  const adapter = embeddedAppToolAdapter({ meta: { template: 'gdevelop-app' } })!;
  for (const name of ['inspect_gdevelop', 'read_gdevelop_content', 'list_gdevelop_capabilities'])
    expect(GDEVELOP_TOOLS.find((tool) => tool.name === name)?.writes).toEqual([]);
  expect(
    adapter.prepare('inspect_gdevelop', { scene: 'Play', section: 'events', offset: 2, limit: 3 }),
  ).toEqual({ op: 'inspect', scene: 'Play', section: 'events', offset: 2, limit: 3 });
  expect(
    adapter.prepare('read_gdevelop_content', {
      path: '/layouts/0/objects/0/behaviors',
      expectedFingerprint: 'a'.repeat(64),
    }),
  ).toMatchObject({ op: 'read-content' });
  expect(
    adapter.prepare('list_gdevelop_capabilities', { kind: 'condition', type: 'CollisionNP' }),
  ).toEqual({ op: 'catalogue', kind: 'condition', type: 'CollisionNP' });
  for (const input of [
    { limit: 51 },
    { offset: -1 },
    { scene: 'Play' },
    { section: 'events' },
    { scene: 'Play', section: 'resources' },
    { section: 'code' },
    { extra: true },
  ])
    expect(() => adapter.prepare('inspect_gdevelop', input)).toThrow();
  for (const input of [
    { path: 'layouts' },
    { path: '/bad~2' },
    { path: '', limit: 8001 },
    { path: '', expectedFingerprint: 'bad' },
  ])
    expect(() => adapter.prepare('read_gdevelop_content', input)).toThrow();
  for (const input of [
    { kind: 'script' },
    { kind: 'action', type: 'Delete', query: 'delete' },
    { kind: 'action', query: ' ' },
    { kind: 'object', code: 'x' },
  ])
    expect(() => adapter.prepare('list_gdevelop_capabilities', input)).toThrow();
});
