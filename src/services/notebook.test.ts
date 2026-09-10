import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookPath, notebookSession } from './notebook';
import { createTask, prepareTaskReview, verifyTaskReview, applyTaskReview } from './tasks';
import { exportCrux, importCrux } from './crux-io';

beforeEach(async () => {
  await initServices('local');
});
async function fixture(id?: string) {
  const store = createCruxStore();
  const crux = id
    ? await getServices().crux.findById(id)
    : await getServices().crux.create({ title: 'Notebook', kind: 'notes', type: 'workspace' });
  store.setState({ crux });
  return { store, crux, call: notebookSession(store) };
}
describe('notebook Artifact bridge', () => {
  it.each([
    '../secret.md',
    '/secret.md',
    'a/../../secret.md',
    'a\\secret.md',
    'a/%2e%2e/b.md',
    'a/.hidden/b.md',
    'publish.json/a',
    'src/app.ts',
    'assets/test.svg',
    'assets/../a.png',
  ])('rejects %s', (path) => {
    expect(() => notebookPath(path)).toThrow();
  });
  it('acknowledges durable saves, records Growth and rejects stale writers', async () => {
    const { call, store, crux } = await fixture();
    const first = (await call({
      op: 'write',
      path: 'Ideas/First.md',
      content: '# First',
      expected: null,
    })) as { fingerprint: string };
    expect(await call({ op: 'read', path: 'Ideas/First.md' })).toEqual({
      content: '# First',
      fingerprint: first.fingerprint,
    });
    expect(store.getState().growths).toHaveLength(1);
    await call({
      op: 'write',
      path: 'Ideas/First.md',
      content: '# Second',
      expected: first.fingerprint,
    });
    await expect(
      call({
        op: 'write',
        path: 'Ideas/First.md',
        content: '# Stale',
        expected: first.fingerprint,
      }),
    ).rejects.toThrow('changed elsewhere');
    expect(
      ((await call({ op: 'read', path: 'Ideas/First.md' })) as { content: string }).content,
    ).toBe('# Second');
    const files = await getServices().artifact.findByResource('crux', crux.id);
    expect(files.map((a) => a.meta?.path)).toEqual(['notebook/Ideas/First.md']);
  });
  it('blocks history, closed workspaces and non-notebook Cruxes', async () => {
    const { call, store } = await fixture();
    store.setState({ viewingSnapshotId: 'old' });
    await expect(call({ op: 'list' })).rejects.toThrow('current notebook');
    store.setState({ viewingSnapshotId: null, closing: true });
    await expect(call({ op: 'list' })).rejects.toThrow('no longer open');
    store.setState({ closing: false, crux: { ...store.getState().crux!, kind: 'webapp' } });
    await expect(call({ op: 'list' })).rejects.toThrow('no longer open');
  });
  it('binds writes to the Task, and carries notebook files and history through an archive', async () => {
    const main = await fixture();
    const first = (await main.call({
      op: 'write',
      path: 'First.md',
      content: 'Main',
      expected: null,
    })) as { fingerprint: string };
    const task = await createTask(main.crux.id, 'Change editor');
    const copy = await fixture(task.id);
    await copy.call({
      op: 'write',
      path: 'First.md',
      content: 'Task note',
      expected: first.fingerprint,
      cruxId: main.crux.id,
    });
    expect(
      ((await main.call({ op: 'read', path: 'First.md' })) as { content: string }).content,
    ).toBe('Main');
    const archive = await exportCrux({ cruxId: main.crux.id });
    const result = await importCrux({ data: archive.blob, mode: 'clone' });
    const restored = await fixture(result.cruxId);
    expect(restored.crux.kind).toBe('notes');
    expect(
      ((await restored.call({ op: 'read', path: 'First.md' })) as { content: string }).content,
    ).toBe('Main');
  });
});

it('merges editor-only customization while preserving newer notes on Main', async () => {
  const main = await fixture();
  const initial = (await main.call({
    op: 'write',
    path: 'First.md',
    content: 'Original note',
    expected: null,
  })) as { fingerprint: string };
  const artifact = getServices().artifact;
  await artifact.create({
    resourceId: main.crux.id,
    content: 'old layout',
    meta: { path: 'src/layout.css' },
  });
  const task = await createTask(main.crux.id, 'Customize notebook');
  await artifact.create({
    resourceId: task.id,
    content: 'new layout',
    meta: { path: 'src/layout.css' },
  });
  await main.call({
    op: 'write',
    path: 'First.md',
    content: 'Today’s notes stay',
    expected: initial.fingerprint,
  });
  const review = await prepareTaskReview(task.id);
  expect(review.conflicts).toHaveLength(0);
  await verifyTaskReview(review.id);
  await applyTaskReview(review.id);
  expect(((await main.call({ op: 'read', path: 'First.md' })) as { content: string }).content).toBe(
    'Today’s notes stay',
  );
  const layout = (await artifact.findByResource('crux', main.crux.id)).find(
    (a) => a.meta?.path === 'src/layout.css',
  )!;
  expect(await artifact.readContent(layout.id)).toBe('new layout');
});

it('rejects an external disk edit before the watcher has delivered it, then reloads it', async () => {
  const files = new Map<string, Uint8Array>();
  vi.stubGlobal('window', {
    electronAPI: {
      project: {
        createFolder: async () => '/garden/notebook',
        ensureFolder: async () => '/garden/notebook',
        writeFile: async (_folder: string, path: string, data: Uint8Array) => {
          files.set(path, data);
        },
        readFile: async (_folder: string, path: string) => {
          const bytes = files.get(path);
          if (!bytes) throw new Error('ENOENT');
          return bytes;
        },
      },
    },
  });
  try {
    const { call } = await fixture();
    const saved = (await call({
      op: 'write',
      path: 'First.md',
      content: 'Original',
      expected: null,
    })) as { fingerprint: string };
    files.set('notebook/First.md', new TextEncoder().encode('External'));
    await expect(
      call({ op: 'write', path: 'First.md', content: 'Stale draft', expected: saved.fingerprint }),
    ).rejects.toThrow('changed elsewhere');
    expect(new TextDecoder().decode(files.get('notebook/First.md'))).toBe('External');
    const reloaded = (await call({ op: 'read', path: 'First.md' })) as {
      content: string;
      fingerprint: string;
    };
    expect(reloaded.content).toBe('External');
    await call({
      op: 'write',
      path: 'First.md',
      content: 'Resolved',
      expected: reloaded.fingerprint,
    });
    expect(new TextDecoder().decode(files.get('notebook/First.md'))).toBe('Resolved');
    files.set('notebook/Unindexed.md', new TextEncoder().encode('Not ingested yet'));
    await expect(
      call({ op: 'write', path: 'Unindexed.md', content: '', expected: null }),
    ).rejects.toThrow('changed elsewhere');
  } finally {
    vi.unstubAllGlobals();
  }
});
