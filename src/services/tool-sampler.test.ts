import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { hashContent } from './sqlite/helpers';
import { samplerPath } from './embedded-app';
import { exportCrux, importCrux } from './crux-io';
import { appChanges } from './app-changes';
import { publishPipeline } from './publish';
import { embeddedAppToolAdapter } from './embedded-app-tool-adapters';
import { registerAppTools } from './embedded-app-tool-registry';
import { createToolExecutor, defaultToolDefinitions, didMutate } from '@/ai/tools';
import { starter, applyCommand } from '../../tool-cruxes/shared/model.js';
beforeEach(() => initServices('local'));
it.each(['tables', 'openmosh', 'smplr', 'playcanvas'])(
  'preserves %s documents through scoped commands, conflicts, Growth and archive roundtrip',
  async (type) => {
    const services = getServices();
    const crux = await services.crux.create({
      title: 'Sampler',
      kind: 'webapp',
      type: 'workspace',
      meta: { template: 'tool-' + type },
    });
    const store = createCruxStore();
    store.setState({ crux });
    const call = notebookSession(store);
    let document = starter(type);
    let saved = (await call({
      op: 'write',
      path: 'project.json',
      content: JSON.stringify(document),
      expected: null,
    })) as { fingerprint: string };
    expect(store.getState().growths.length).toBe(1);
    const adapter = embeddedAppToolAdapter(crux)!;
    const mutate = adapter.tools[1]!.name;
    const off = registerAppTools(crux.id, {
      tools: adapter.tools,
      execute: async (name, input) => {
        const command = adapter.prepare(name, input);
        document = applyCommand(document, command);
        saved = (await call({
          op: 'write',
          path: 'project.json',
          content: JSON.stringify(document),
          expected: saved.fingerprint,
        })) as { fingerprint: string };
        return { saved: true };
      },
    });
    const input =
      type === 'tables'
        ? { rows: [{ id: 'task-1', hours: 9 }] }
        : type === 'openmosh'
          ? { effects: [] }
          : type === 'smplr'
            ? { bpm: 130 }
            : { objects: [{ id: 'center', color: '#ff0000' }] };
    try {
      expect(defaultToolDefinitions(crux.id).map((t) => t.name)).toContain(mutate);
      expect(
        await createToolExecutor(crux.id, undefined, undefined, { scope: { folder: 'src' } })(
          mutate,
          input,
        ),
      ).toContain('outside');
      const result = await createToolExecutor(crux.id)(mutate, input);
      expect(didMutate(mutate, result)).toBe(true);
    } finally {
      off();
    }
    await expect(
      call({
        op: 'write',
        path: 'project.json',
        content: JSON.stringify(starter(type)),
        expected: null,
      }),
    ).rejects.toThrow('changed elsewhere');
    expect(() => samplerPath(type, '../../app.js')).toThrow();
    const artifacts = await services.artifact.findByResource('crux', crux.id);
    expect(appChanges(crux, [], artifacts)).toEqual({ app: 0, content: 1 });
    const archive = await exportCrux({ cruxId: crux.id });
    const imported = await importCrux({ data: archive.blob, mode: 'clone' });
    const files = await services.artifact.findByResource('crux', imported.cruxId);
    const file = files.find((f) => f.meta?.path === 'data/project.json')!;
    expect(JSON.parse(await services.artifact.readContent(file.id))).toEqual(document);
    await expect(publishPipeline(crux, artifacts)).rejects.toThrow(
      'Website sharing is not available',
    );
    store.setState({ viewingSnapshotId: 'past' });
    await expect(call({ op: 'read', path: 'project.json' })).rejects.toThrow('current app');
  },
);

it('preserves imported image bytes separately and rejects a mismatched content address', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Images',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'tool-openmosh' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const content =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPfkAAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(content.split(',')[1]!), (c) => c.charCodeAt(0));
  const hash = await hashContent(bytes);
  const path = `assets/${hash}.png`;
  await expect(
    call({ op: 'write', path: `assets/${'0'.repeat(64)}.png`, content, expected: null }),
  ).rejects.toThrow('original bytes');
  await call({ op: 'write', path, content, expected: null });
  const project = { ...starter('openmosh'), source: path };
  await call({
    op: 'write',
    path: 'project.json',
    content: JSON.stringify(project),
    expected: null,
  });
  const imported = await importCrux({
    data: (await exportCrux({ cruxId: crux.id })).blob,
    mode: 'clone',
  });
  const files = await services.artifact.findByResource('crux', imported.cruxId);
  const image = files.find((f) => f.meta?.path === 'data/' + path)!;
  expect(
    new Uint8Array(await (await services.artifact.downloadBlob(image.id)).arrayBuffer()),
  ).toEqual(bytes);
});

it('acknowledges the bytes written, even when an external edit arrives during snapshot creation', async () => {
  const services = getServices();
  const crux = await services.crux.create({
    title: 'Race',
    kind: 'webapp',
    type: 'workspace',
    meta: { template: 'tool-tables' },
  });
  const store = createCruxStore();
  store.setState({ crux });
  const call = notebookSession(store);
  const original = JSON.stringify(starter('tables'));
  const first = (await call({
    op: 'write',
    path: 'project.json',
    content: original,
    expected: null,
  })) as { fingerprint: string };
  const mine = JSON.stringify({ ...starter('tables'), title: 'My import' });
  const theirs = JSON.stringify({ ...starter('tables'), title: 'External edit' });
  store.setState({
    createSnapshot: async () => {
      await services.artifact.create({
        resourceId: crux.id,
        content: theirs,
        meta: { path: 'data/project.json' },
      });
    },
  });
  const result = (await call({
    op: 'write',
    path: 'project.json',
    content: mine,
    expected: first.fingerprint,
  })) as { fingerprint: string };
  expect(result.fingerprint).toBe(await hashContent(mine));
  await expect(
    call({ op: 'write', path: 'project.json', content: original, expected: result.fingerprint }),
  ).rejects.toThrow('changed elsewhere');
  const file = (await services.artifact.findByResource('crux', crux.id)).find(
    (f) => f.meta?.path === 'data/project.json',
  )!;
  expect(await services.artifact.readContent(file.id)).toBe(theirs);
});
