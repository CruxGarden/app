import { beforeEach, expect, it } from 'vitest';
import { initServices, getServices } from './index';
import { createCruxStore } from '@/stores/cruxStore';
import { notebookSession } from './notebook';
import { NOTEBOOK_PAGE_ROUTE, setNotebookLayout } from './notebook-sharing';
import { registerNotebookEditor } from './notebook-lifecycle';
import { createTask } from './tasks';
import { exportCrux, importCrux } from './crux-io';

beforeEach(async () => {
  await initServices('local');
});
async function fixture() {
  const store = createCruxStore();
  const crux = await getServices().crux.create({
    title: 'Notes',
    kind: 'notes',
    type: 'workspace',
  });
  store.setState({ crux });
  await getServices().artifact.create({
    resourceId: crux.id,
    content: 'reader',
    meta: { path: NOTEBOOK_PAGE_ROUTE },
  });
  const call = notebookSession(store);
  await call({
    op: 'write',
    path: 'publish.json',
    expected: null,
    content: JSON.stringify({
      title: 'Selected edition',
      pages: ['One.md'],
      custom: { color: 'green' },
    }),
  });
  return { store, crux, call };
}
async function config(call: ReturnType<typeof notebookSession>) {
  const result = (await call({ op: 'read', path: 'publish.json' })) as {
    content: string;
    fingerprint: string;
  };
  return { ...result, value: JSON.parse(result.content) };
}
it('flushes pending edits, preserves publication fields and carries the choice through Tasks and archives', async () => {
  const { store, crux, call } = await fixture();
  const unregister = registerNotebookEditor(crux.id, {
    dirty: () => true,
    flush: async () => {
      const current = await config(call);
      await call({
        op: 'write',
        path: 'publish.json',
        expected: current.fingerprint,
        content: JSON.stringify({ ...current.value, pages: ['One.md', 'Two.md'] }),
      });
    },
  });
  try {
    await setNotebookLayout(store, 'separate-pages');
  } finally {
    unregister();
  }
  const selected = (await config(call)).value;
  expect(selected).toEqual({
    title: 'Selected edition',
    pages: ['One.md', 'Two.md'],
    custom: { color: 'green' },
    layout: 'separate-pages',
  });
  expect(store.getState().growths.length).toBeGreaterThanOrEqual(3);
  const task = await createTask(crux.id, 'Try another layout');
  const taskStore = createCruxStore();
  taskStore.setState({ crux: await getServices().crux.findById(task.id) });
  await setNotebookLayout(taskStore, 'single-page');
  expect((await config(call)).value.layout).toBe('separate-pages');
  expect((await config(notebookSession(taskStore))).value.layout).toBe('single-page');
  const archive = await exportCrux({ cruxId: crux.id });
  const restored = await importCrux({ data: archive.blob, mode: 'clone' });
  const restoredStore = createCruxStore();
  restoredStore.setState({ crux: await getServices().crux.findById(restored.cruxId) });
  expect((await config(notebookSession(restoredStore))).value).toEqual(selected);
});
it('rejects unsupported layouts, history edits, failed editor saves and readers without the route', async () => {
  const { store, crux, call } = await fixture();
  const current = await config(call);
  await expect(
    call({
      op: 'write',
      path: 'publish.json',
      expected: current.fingerprint,
      content: JSON.stringify({ ...current.value, layout: 'unknown' }),
    }),
  ).rejects.toThrow();
  store.setState({ viewingSnapshotId: 'history' });
  await expect(setNotebookLayout(store, 'separate-pages')).rejects.toThrow('current app');
  store.setState({ viewingSnapshotId: null });
  const unregister = registerNotebookEditor(crux.id, {
    dirty: () => true,
    flush: async () => {
      throw new Error('Save failed');
    },
  });
  try {
    await expect(setNotebookLayout(store, 'separate-pages')).rejects.toThrow('Save failed');
  } finally {
    unregister();
  }
  const route = (await getServices().artifact.findByResource('crux', crux.id)).find(
    (a) => a.meta?.path === NOTEBOOK_PAGE_ROUTE,
  )!;
  await getServices().artifact.delete(route.id);
  await expect(setNotebookLayout(store, 'separate-pages')).rejects.toThrow('updated public reader');
  expect(await config(call)).toEqual(current);
});
it('retains stale-writer protection when a layout changes beneath an open editor', async () => {
  const { store, call } = await fixture();
  const stale = await config(call);
  await setNotebookLayout(store, 'separate-pages');
  await expect(
    call({
      op: 'write',
      path: 'publish.json',
      expected: stale.fingerprint,
      content: stale.content,
    }),
  ).rejects.toThrow('changed elsewhere');
  const fresh = await config(call);
  await call({
    op: 'write',
    path: 'publish.json',
    expected: fresh.fingerprint,
    content: JSON.stringify({ ...fresh.value, pages: ['Two.md'] }),
  });
  expect((await config(call)).value).toMatchObject({ layout: 'separate-pages', pages: ['Two.md'] });
});
