import { beforeEach, expect, it, vi } from 'vitest';
import { initServices, getServices } from '@/services';
import { createCruxStore } from './cruxStore';
import { localApiFixture } from '@/test/local-api-fixture';
import { createTask } from '@/services/tasks';
import { getSqliteClient } from '@/services/sqlite/client';

const native = localApiFixture();

beforeEach(async () => {
  await initServices();
});
it('refreshes committed details without replacing the live conversation or selected history', async () => {
  const crux = await getServices().crux.create({ title: 'Before', meta: { notes: 'Before' } });
  const store = createCruxStore();
  store.setState({
    crux,
    streamingContent: 'still writing',
    isStreaming: true,
    viewingSnapshotId: 'viewed',
  });
  const messages = store.getState().messages;
  await getServices().crux.update(crux.id, {
    title: 'After',
    meta: { notes: 'Saved', messages: [{ content: 'different history' }] },
  });
  await store.getState().refreshDetails(['title', 'meta'], ['notes', 'messages']);
  expect(store.getState().crux?.title).toBe('After');
  expect(store.getState().crux?.meta?.notes).toBe('Saved');
  expect(store.getState().messages).toBe(messages);
  expect(store.getState()).toMatchObject({
    streamingContent: 'still writing',
    isStreaming: true,
    viewingSnapshotId: 'viewed',
  });
});
it('cannot resurrect a closed workspace or overwrite a detail changed during the read', async () => {
  const service = getServices().crux;
  const crux = await service.create({ title: 'Before' });
  const store = createCruxStore();
  store.setState({ crux });
  let resolve!: (value: typeof crux) => void;
  const pending = new Promise<typeof crux>((r) => {
    resolve = r;
  });
  const spy = vi.spyOn(service, 'findById').mockReturnValue(pending);
  try {
    const refresh = store.getState().refreshDetails(['title'], []);
    await Promise.resolve();
    store.setState({ crux: { ...crux, title: 'New local edit' } });
    resolve({ ...crux, title: 'Background title' });
    await refresh;
    expect(store.getState().crux?.title).toBe('New local edit');
    const closed = store.getState().refreshDetails(['title'], []);
    store.getState().reset();
    await closed;
    expect(store.getState().crux).toBeNull();
  } finally {
    spy.mockRestore();
  }
});

it('refreshes Task phase without replacing live messages or editor state', async () => {
  const crux = await getServices().crux.create({ title: 'Main' });
  const copy = await createTask(crux.id, 'Task');
  const task = await getServices().crux.findById(copy.id);
  const store = createCruxStore();
  store.setState({ crux: task, streamingContent: 'retained', viewingSnapshotId: 'selected' });
  const messages = store.getState().messages;
  await getSqliteClient().setWorkingCopyArchived!(copy.id, true, copy.revision);
  await native().restart();
  await store.getState().refreshDetails(['phase'], []);
  expect(store.getState().crux?.meta?.workingCopy).toMatchObject({
    phase: 'archived',
    taskId: copy.taskId,
    baseParentId: copy.baseState.workspace.parentId,
  });
  expect(store.getState().messages).toBe(messages);
  expect(store.getState()).toMatchObject({
    streamingContent: 'retained',
    viewingSnapshotId: 'selected',
  });
});
