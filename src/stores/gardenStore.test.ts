import { beforeEach, expect, it, vi } from 'vitest';
import type { Crux } from '@/api/types';
const fixtures = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('./gardenContext', () => ({ captureGardenId: () => null }));
vi.mock('./workspaceRegistry', () => ({ allWorkspaces: () => [] }));
vi.mock('@/services/garden-navigation', () => ({
  gardenMembers: vi.fn(),
  opensAsWorkspace: () => true,
}));
vi.mock('@/services', () => ({
  getServices: () => ({
    crux: {
      listAll: fixtures.list,
      listTrashed: async () => [],
      purgeTrash: async () => {},
    },
  }),
}));
vi.mock('@/services/sqlite/client', () => ({ getSqliteClient: () => ({ all: async () => [] }) }));
import { useGardenStore } from './gardenStore';

beforeEach(() => {
  useGardenStore.setState({ allCruxes: [], cruxList: [], search: '', sortBy: 'created' });
});
it.each(['load', 'refresh'] as const)(
  '%s honors controls changed while its read is pending',
  async (method) => {
    let finish!: (rows: Crux[]) => void;
    fixtures.list.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const read = useGardenStore.getState()[method]();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    useGardenStore.getState().setSearch('keep');
    useGardenStore.getState().setSortBy('updated');
    finish([
      { id: 'a', title: 'keep A', created: '2026-01-03', updated: '2026-01-01' },
      { id: 'b', title: 'keep B', created: '2026-01-01', updated: '2026-01-03' },
      { id: 'c', title: 'hide me', created: '2026-01-04', updated: '2026-01-04' },
    ] as Crux[]);
    await read;
    expect(useGardenStore.getState().cruxList.map((crux) => crux.id)).toEqual(['b', 'a']);
  },
);
