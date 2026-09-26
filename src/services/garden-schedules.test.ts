import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  byGarden: new Map<string, unknown[]>(),
  ids: new Set<string>(),
  writes: [] as { gardenId: string; ids: string[] }[],
}));
vi.mock('./sqlite/client', () => ({
  getSqliteClient: () => ({ gardenMembership: {}, onChange: () => () => {} }),
}));
vi.mock('./garden-schedules', async (original) => ({
  ...(await original<typeof import('./garden-schedules')>()),
  readGardenSchedules: async () => mock.byGarden,
  gardenIds: async () => mock.ids,
  writeGardenSchedules: async (gardenId: string, defs: { id: string }[]) => {
    mock.writes.push({ gardenId, ids: defs.map((d) => d.id) });
  },
}));
import {
  SCHEDULES_KEY,
  addSchedule,
  initSchedules,
  reconcileGardenSchedules,
  useSchedules,
} from './schedules';
import { setSetting } from './settings';
import { useGardenContext } from '@/stores/gardenContext';

const T0 = new Date('2026-09-25T09:00:00Z');
const flush = () => new Promise((r) => setTimeout(r, 0));
const every = (minutes: number) => ({ kind: 'every' as const, minutes });
const alert = [{ kind: 'alert' as const }];

beforeEach(() => {
  mock.byGarden.clear();
  mock.ids = new Set(['root', 'studio']);
  mock.writes.length = 0;
  setSetting(SCHEDULES_KEY, '[]');
  initSchedules(T0);
  useGardenContext.setState({
    root: { id: 'root', slug: 'root' },
    garden: { id: 'studio', slug: 'studio' },
  });
});

it('a Garden without a copy receives its schedules; later edits are written to it', async () => {
  addSchedule({ title: 'Stretch', trigger: every(60), actions: alert }, T0);
  await reconcileGardenSchedules(T0);
  await flush();
  expect(mock.writes.at(-1)).toMatchObject({ gardenId: 'studio', ids: [expect.any(String)] });
  const before = mock.writes.length;
  addSchedule({ title: 'Water', trigger: every(30), actions: alert }, T0);
  await flush();
  expect(mock.writes.length).toBe(before + 1);
  expect(mock.writes.at(-1)!.ids).toHaveLength(2);
});

it('what a Garden holds wins: imported ones arrive, removed ones go, gone Gardens take theirs', async () => {
  addSchedule({ id: 'kept', title: 'Kept', trigger: every(60), actions: alert }, T0);
  addSchedule({ id: 'removed', title: 'Removed', trigger: every(60), actions: alert }, T0);
  addSchedule(
    { id: 'orphan', title: 'Orphan', gardenId: 'gone', trigger: every(60), actions: alert },
    T0,
  );
  mock.byGarden.set('studio', [
    { id: 'kept', title: 'Kept, renamed', enabled: false, trigger: every(60), actions: alert },
    { id: 'imported', title: 'Imported', enabled: true, trigger: every(15), actions: alert },
  ]);
  await reconcileGardenSchedules(T0);
  const list = useSchedules.getState().schedules;
  expect(list.map((s) => s.id).sort()).toEqual(['imported', 'kept']);
  expect(list.find((s) => s.id === 'kept')).toMatchObject({
    title: 'Kept, renamed',
    enabled: false,
  });
  expect(list.find((s) => s.id === 'imported')).toMatchObject({ gardenId: 'studio' });
});
