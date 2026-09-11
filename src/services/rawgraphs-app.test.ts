import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';
beforeEach(() => initServices('local'));
it('preserves dataset bytes and chart mappings through Growth and complete Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Research',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'rawgraphs-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      ['Group', 'Value'],
      ['Control', 2.5],
      ['Experiment', 4.25],
    ]),
  );
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
    app: 'rawgraphs',
    project: {
      snapshot: {
        type: 'native',
        value: {
          version: '1.2',
          chart: 'rawgraphs.barchart',
          mapping: { bars: { value: ['Group'] } },
          visualOptions: { width: 800, height: 500 },
          dataTypes: { Group: 'string', Value: 'number' },
          parseOptions: {},
          rawData: ref,
          userInput: ref,
        },
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
  await expect(call({ op: 'native-read', path: '../other' })).rejects.toThrow();
  await expect(
    call({
      op: 'write',
      path: 'project.json',
      content: JSON.stringify({ ...doc, app: 'piskel' }),
      expected: saved.fingerprint,
    }),
  ).rejects.toThrow('RAWGraphs');
  doc.project.snapshot.value.visualOptions.width = 1200;
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify(doc),
    expected: saved.fingerprint,
  });
  expect(
    (await services.artifact.findByResource('crux', crux.id)).filter((f) =>
      f.meta?.path?.toString().startsWith('data/assets/'),
    ),
  ).toHaveLength(1);
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
it('scopes chart tools to inspection and bounded dimensions', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'rawgraphs-app' } })!;
  expect(a.prepare('inspect_rawgraphs', {})).toEqual({ op: 'inspect' });
  expect(a.prepare('set_rawgraphs_size', { width: 900, height: 550 })).toEqual({
    op: 'size',
    width: 900,
    height: 550,
  });
  expect(() => a.prepare('set_rawgraphs_size', { width: 0, height: 550 })).toThrow();
  expect(() =>
    a.prepare('set_rawgraphs_size', { width: 900, height: 550, path: '../other' }),
  ).toThrow();
});
