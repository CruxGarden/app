import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { exportCrux, importCrux } from './crux-io';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';

beforeEach(() => initServices('local'));
it('preserves native Mermaid native diagram source, configuration and history in Growth and complete Crux archives', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Mermaid',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'mermaid-app' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const doc = {
    version: 1,
    app: 'mermaid',
    project: {
      storage: {
        codeStore: JSON.stringify({ code: 'flowchart LR\n A-->B', mermaid: '{"theme":"dark"}' }),
        manualHistoryStore: JSON.stringify([{ id: 'saved-diagram', name: 'First diagram' }]),
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
  ).rejects.toThrow('Mermaid');
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify({ version: 1, app: 'mermaid', project: null }),
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
});

it('scopes Mermaid agent edits to source', () => {
  const a = embeddedAppToolAdapter({ meta: { template: 'mermaid-app' } })!;
  expect(a.prepare('inspect_mermaid', {})).toEqual({ op: 'inspect' });
  expect(a.prepare('set_mermaid_source', { code: 'flowchart LR\n A-->B' })).toEqual({
    op: 'code',
    code: 'flowchart LR\n A-->B',
  });
  expect(() => a.prepare('set_mermaid_source', { code: 'graph LR', path: '../other' })).toThrow();
});
