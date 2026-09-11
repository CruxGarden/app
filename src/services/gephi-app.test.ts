import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';
beforeEach(() => initServices('local'));
it('retains native network components through Growth and portable Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Research',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'gephi-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const dataset = {
    nodes: [{ key: 'a', attributes: { label: 'Alpha' } }],
    edges: [],
    appearance: { nodeColor: '#123456' },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(dataset));
  const asset = (await call({
    op: 'native-import',
    bytes: bytes.buffer,
    mimeType: 'application/json',
  })) as { path: string };
  const ref = {
    __cruxBinary: {
      path: asset.path,
      kind: 'buffer',
      type: 'application/json',
      size: bytes.byteLength,
    },
  };
  const doc = {
    version: 1,
    app: 'gephi',
    project: Object.fromEntries(
      ['dataset', 'appearance', 'filters', 'session', 'preferences'].map((k) => [k, ref]),
    ),
  };
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
      app: 'gephi',
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
  const data = await services.artifact.downloadBlob(
    files.find((f) => f.meta?.path === 'data/' + asset.path)!.id,
  );
  expect(new Uint8Array(await data.arrayBuffer())).toEqual(bytes);
});
it('limits agent commands to network inspection and bounded native title changes', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'gephi-app' } })!;
  expect(a.prepare('inspect_gephi', {})).toEqual({ op: 'inspect' });
  expect(a.prepare('set_gephi_title', { title: 'Connections' })).toEqual({
    op: 'set-title',
    title: 'Connections',
  });
  expect(() => a.prepare('set_gephi_title', { title: 'x'.repeat(301) })).toThrow();
  expect(() => a.prepare('set_gephi_title', { title: 'Connections', run: true })).toThrow();
});
