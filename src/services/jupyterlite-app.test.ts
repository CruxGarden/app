import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';
beforeEach(() => initServices('local'));
it('retains native notebook cells, outputs and folders through Growth and portable Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Research',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'jupyterlite-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [
      {
        cell_type: 'code',
        id: 'mean',
        source: 'sum([2,4,6])/3',
        metadata: {},
        execution_count: 1,
        outputs: [
          {
            output_type: 'execute_result',
            execution_count: 1,
            metadata: {},
            data: { 'text/plain': '4.0' },
          },
        ],
      },
    ],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(notebook));
  const asset = (await call({
    op: 'native-import',
    bytes: bytes.buffer,
    mimeType: 'application/json',
  })) as { path: string };
  const doc = {
    version: 1,
    app: 'jupyterlite',
    project: {
      files: [
        { path: 'research', type: 'directory', content: null },
        {
          path: 'research/analysis.ipynb',
          type: 'notebook',
          format: 'json',
          mimetype: 'application/x-ipynb+json',
          content: {
            __cruxBinary: {
              path: asset.path,
              kind: 'buffer',
              type: 'application/json',
              size: bytes.byteLength,
            },
          },
        },
      ],
      open: ['research/analysis.ipynb'],
      active: 'research/analysis.ipynb',
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
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify({
      version: 1,
      app: 'jupyterlite',
      project: { files: [], open: [], active: null },
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
it('limits agent commands to native notebook inspection and bounded cell insertion', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'jupyterlite-app' } })!;
  expect(a.prepare('inspect_jupyterlite', {})).toEqual({ op: 'inspect' });
  expect(a.prepare('append_jupyterlite_cell', { cellType: 'code', source: '1+1' })).toEqual({
    op: 'append-cell',
    cellType: 'code',
    source: '1+1',
  });
  expect(() =>
    a.prepare('append_jupyterlite_cell', { cellType: 'code', source: '1+1', run: true }),
  ).toThrow();
  expect(() => a.prepare('append_jupyterlite_cell', { cellType: 'raw', source: '1+1' })).toThrow();
});
