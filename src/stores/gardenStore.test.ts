import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Crux } from '@/api/types';
const fixtures = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn() }));
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
      update: fixtures.update,
      listTrashed: async () => [],
      purgeTrash: async () => {},
    },
  }),
}));
vi.mock('@/services/sqlite/client', () => ({ getSqliteClient: () => ({ all: async () => [] }) }));
import { filterAndSort, useGardenStore } from './gardenStore';

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

const crux = (fields: Partial<Crux> & { id: string }) =>
  ({ created: '2026-01-01', updated: '2026-01-01', slug: fields.id, ...fields }) as Crux;

describe('Home search', () => {
  const list = [
    crux({ id: 'a', title: 'Field notes', meta: { tags: ['botany', 'spring-walk'] } }),
    crux({ id: 'b', title: 'Botany poster', description: 'for the fair' }),
    crux({ id: 'c', title: 'Synth patch', meta: { tags: ['music'] } }),
  ];
  const ids = (search: string) => filterAndSort(list, search, 'name').map((c) => c.id);

  it('matches plain words against title, slug, description and tags', () => {
    expect(ids('botany')).toEqual(['b', 'a']);
    expect(ids('FAIR')).toEqual(['b']);
    expect(ids('spring')).toEqual(['a']);
    expect(ids('c')).toContain('c');
  });
  it('matches a #tag query against tags only', () => {
    expect(ids('#botany')).toEqual(['a']);
    expect(ids('#Music')).toEqual(['c']);
    expect(ids('#poster')).toEqual([]);
  });
  it('tolerates a Crux without tags or with malformed tags', () => {
    expect(
      filterAndSort([crux({ id: 'x', title: 'X', meta: { tags: 'oops' } as never })], '#o', 'name'),
    ).toEqual([]);
  });
});

describe('Home sort by name', () => {
  it('orders A–Z without regard to case, falling back to the slug', () => {
    const sorted = filterAndSort(
      [
        crux({ id: '1', title: 'banana' }),
        crux({ id: '2', title: 'Apple' }),
        crux({ id: '3', title: '', slug: 'cherry' }),
        crux({ id: '4', title: 'Éclair' }),
        crux({ id: '5', title: 'apple 10' }),
        crux({ id: '6', title: 'apple 2' }),
      ],
      '',
      'name',
    );
    expect(sorted.map((c) => c.id)).toEqual(['2', '6', '5', '1', '3', '4']);
  });
  it('keeps the newest-first date sorts', () => {
    const rows = [
      crux({ id: 'old', title: 'A', created: '2026-01-01' }),
      crux({ id: 'new', title: 'Z', created: '2026-02-01' }),
    ];
    expect(filterAndSort(rows, '', 'created').map((c) => c.id)).toEqual(['new', 'old']);
    useGardenStore.setState({ allCruxes: rows });
    useGardenStore.getState().setSortBy('name');
    expect(useGardenStore.getState().cruxList.map((c) => c.id)).toEqual(['old', 'new']);
  });
});

describe('rename from the Home card', () => {
  beforeEach(() => {
    fixtures.update.mockReset().mockResolvedValue(undefined);
    fixtures.list.mockReset();
  });
  it('sends only the title, exactly as the Details pane does, so the slug stays', async () => {
    const before = crux({ id: 'a', title: 'Old name', slug: 'old-name' });
    useGardenStore.setState({ allCruxes: [before], cruxList: [before] });
    fixtures.list.mockResolvedValue([{ ...before, title: 'New name' }]);
    await useGardenStore.getState().renameCrux('a', '  New name  ');
    expect(fixtures.update).toHaveBeenCalledExactlyOnceWith('a', { title: 'New name' });
    const after = useGardenStore.getState().cruxList[0]!;
    expect(after.title).toBe('New name');
    expect(after.slug).toBe('old-name');
  });
  it('writes nothing when the name is unchanged', async () => {
    const before = crux({ id: 'a', title: 'Same' });
    useGardenStore.setState({ allCruxes: [before] });
    await useGardenStore.getState().renameCrux('a', ' Same ');
    expect(fixtures.update).not.toHaveBeenCalled();
  });
  it('accepts an empty or duplicate name, as the Details pane does', async () => {
    const rows = [crux({ id: 'a', title: 'One' }), crux({ id: 'b', title: 'Two' })];
    useGardenStore.setState({ allCruxes: rows });
    fixtures.list.mockResolvedValue(rows);
    await useGardenStore.getState().renameCrux('a', '');
    await useGardenStore.getState().renameCrux('b', 'One');
    expect(fixtures.update.mock.calls).toEqual([
      ['a', { title: '' }],
      ['b', { title: 'One' }],
    ]);
  });
  it('leaves the list alone and reports when the write fails', async () => {
    const before = crux({ id: 'a', title: 'Old' });
    useGardenStore.setState({ allCruxes: [before], cruxList: [before] });
    fixtures.update.mockRejectedValue(new Error('Change the Crux’s details in Main.'));
    await expect(useGardenStore.getState().renameCrux('a', 'New')).rejects.toThrow('Main');
    expect(useGardenStore.getState().cruxList[0]!.title).toBe('Old');
  });
});
