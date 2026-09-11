import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';
beforeEach(() => initServices('local'));
it('retains native models, animations and texture components through Growth and portable Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Research',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'blockbench-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const modelId = crypto.randomUUID();
  const components = {
    index: { models: [modelId], open: [modelId], active: modelId },
    preferences: { settings: '{}' },
    ['model-' + modelId]: {
      meta: { format_version: '5.0' },
      name: 'Lantern',
      elements: [{ name: 'cube' }],
      animations: [{ name: 'sway' }],
    },
    ['asset-' + 'b'.repeat(64)]: 'data:image/png;base64,aGVsbG8=',
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
  const doc = { version: 1, app: 'blockbench', project };
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
      app: 'blockbench',
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

it('limits agent commands to bounded native model operations', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'blockbench-app' } })!;
  expect(a.prepare('rename_blockbench_element', { elementId: 'cube-id', name: 'Lantern' })).toEqual(
    { op: 'rename-element', elementId: 'cube-id', name: 'Lantern' },
  );
  expect(() =>
    a.prepare('rename_blockbench_element', { elementId: 'cube-id', name: 'x', code: 'run()' }),
  ).toThrow();
  expect(() => a.prepare('set_blockbench_name', { name: 'x'.repeat(201) })).toThrow();
});
