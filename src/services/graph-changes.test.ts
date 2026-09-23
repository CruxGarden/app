import { afterEach, expect, it, vi } from 'vitest';
import { getSqliteClient } from './sqlite/client';
import { applyGraphChange, initGraphChanges } from './graph-changes';
import type { LocalGraphChange } from '@/lib/platform';

type TestWorkspace = {
  id: string;
  cruxId: string;
  phase: string;
  loaded?: Promise<void>;
  data: {
    getState: () => {
      refreshDetails: (fields: readonly string[], keys: readonly string[]) => Promise<void>;
    };
  };
};
const { workspaces, refreshGarden } = vi.hoisted(() => ({
  workspaces: vi.fn(() => [] as TestWorkspace[]),
  refreshGarden: vi.fn(async () => {}),
}));
vi.mock('@/stores/workspaceRegistry', () => ({ allWorkspaces: workspaces }));
vi.mock('@/stores/gardenStore', () => ({
  useGardenStore: { getState: () => ({ loading: false, refresh: refreshGarden }) },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const event: LocalGraphChange = {
  entity: 'crux',
  id: 'main',
  streamId: 'stream',
  sequence: 1,
  fields: ['title'],
  metaKeys: [],
};
it('refreshes the owning Crux and open Task projections, not unrelated or unopened workspaces', async () => {
  vi.stubGlobal('window', new EventTarget());
  const main = vi.fn(async () => {}),
    task = vi.fn(async () => {}),
    other = vi.fn(async () => {});
  workspaces.mockReturnValue([
    {
      id: 'main',
      cruxId: 'main',
      phase: 'ready',
      data: { getState: () => ({ refreshDetails: main }) },
    },
    {
      id: 'task',
      cruxId: 'main',
      phase: 'ready',
      data: { getState: () => ({ refreshDetails: task }) },
    },
    {
      id: 'other',
      cruxId: 'other',
      phase: 'ready',
      data: { getState: () => ({ refreshDetails: other }) },
    },
  ]);
  await applyGraphChange(event);
  expect(main).toHaveBeenCalledWith(['title'], []);
  expect(task).toHaveBeenCalledWith(['title'], []);
  expect(other).not.toHaveBeenCalled();
  main.mockClear();
  task.mockClear();
  await applyGraphChange({
    ...event,
    entity: 'working-copy',
    id: 'task',
    cruxId: 'main',
    fields: ['meta'],
    metaKeys: ['notes'],
  });
  expect(main).not.toHaveBeenCalled();
  expect(task).toHaveBeenCalledWith(['meta'], ['notes']);
  task.mockClear();
  await applyGraphChange({ ...event, fields: ['meta'], metaKeys: ['messages'] });
  expect(task).not.toHaveBeenCalled();
  expect(main).not.toHaveBeenCalled();
});
it('reinitialization removes the prior subscription and unsubscribing a legacy client is safe', () => {
  const off = vi.fn();
  const client = getSqliteClient();
  client.onChange = vi.fn(() => off);
  initGraphChanges();
  initGraphChanges();
  expect(off).toHaveBeenCalledOnce();
  expect(client.onChange).toHaveBeenCalledTimes(2);
  delete client.onChange;
  initGraphChanges();
  expect(off).toHaveBeenCalledTimes(2);
});

it('rechecks a Task owner after an in-flight load before refreshing its title', async () => {
  vi.stubGlobal('window', new EventTarget());
  let release!: () => void;
  const loaded = new Promise<void>((resolve) => {
    release = resolve;
  });
  const refreshDetails = vi.fn(async () => {});
  const task = {
    id: 'task',
    cruxId: 'task',
    phase: 'loading',
    loaded,
    data: { getState: () => ({ refreshDetails }) },
  };
  workspaces.mockReturnValue([task]);
  const updating = applyGraphChange(event);
  expect(refreshDetails).not.toHaveBeenCalled();
  task.cruxId = 'main';
  task.phase = 'ready';
  release();
  await updating;
  expect(refreshDetails).toHaveBeenCalledWith(['title'], []);
});

it('refreshes the Garden after lifecycle commits without rereading a removed workspace', async () => {
  const refreshDetails = vi.fn(async () => {});
  workspaces.mockReturnValue([
    { id: 'main', cruxId: 'main', phase: 'ready', data: { getState: () => ({ refreshDetails }) } },
  ]);
  await applyGraphChange({ ...event, entity: 'crux-lifecycle', operation: 'purge' });
  expect(refreshGarden).toHaveBeenCalledOnce();
  expect(refreshDetails).not.toHaveBeenCalled();
});
