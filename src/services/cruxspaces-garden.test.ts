import { beforeEach, expect, it, vi } from 'vitest';

// A Garden graph in memory: rows plus single-placement membership, as the API owns it.
const graph = vi.hoisted(() => {
  const rows = new Map<string, { id: string; title: string; description: string; kind: string }>();
  const parent = new Map<string, string>();
  const membership = {
    parents: vi.fn(async (id: string) => (parent.has(id) ? [{ id: parent.get(id)! }] : [])),
    add: vi.fn(async ({ gardenId, memberId }: { gardenId: string; memberId: string }) => {
      if (parent.has(memberId)) throw new Error('already planted');
      parent.set(memberId, gardenId);
    }),
    move: vi.fn(
      async (input: { gardenId: string; memberId: string; expectedParents: string[] }) => {
        if (parent.get(input.memberId) !== input.expectedParents[0]) throw new Error('stale');
        parent.set(input.memberId, input.gardenId);
      },
    ),
    list: vi.fn(async (gardenId: string) => ({
      items: [...parent].filter(([, p]) => p === gardenId).map(([id]) => rows.get(id)!),
      next: null,
    })),
  };
  const db = {
    gardenMembership: membership,
    get: vi.fn(async (_sql: string, [id]: string[]) => {
      const row = rows.get(id!);
      return row?.kind === 'garden' ? { ...row, created: 'c', updated: 'u' } : undefined;
    }),
    all: vi.fn(async (_sql: string, ids?: string[]) =>
      ids
        ? ids.map((id) => ({ ...rows.get(id)!, meta: '{}' }))
        : [...rows.values()]
            .filter((r) => r.kind === 'garden')
            .map((r) => ({ ...r, created: 'c', updated: 'u' })),
    ),
  };
  const crux = {
    create: vi.fn(
      async (input: { title: string; description?: string; kind: string; gardenId?: string }) => {
        const id = `g${rows.size}`;
        rows.set(id, {
          id,
          title: input.title,
          description: input.description ?? '',
          kind: input.kind,
        });
        if (input.gardenId) parent.set(id, input.gardenId);
        return { id };
      },
    ),
    update: vi.fn(async (id: string, patch: { title: string; description: string }) => {
      Object.assign(rows.get(id)!, patch);
    }),
    delete: vi.fn(async (id: string) => {
      rows.delete(id);
      parent.delete(id);
    }),
  };
  return { rows, parent, membership, db, crux };
});
vi.mock('./sqlite/client', () => ({ getSqliteClient: () => graph.db }));
vi.mock('./index', () => ({ getServices: () => ({ crux: graph.crux }) }));

import { useGardenContext } from '@/stores/gardenContext';
import {
  createCruxspace,
  deleteCruxspace,
  getCruxspace,
  listCruxspaces,
  updateCruxspace,
} from './cruxspaces';

const node = (id: string, kind: string, garden?: string) => {
  graph.rows.set(id, { id, title: id, description: '', kind });
  if (garden) graph.parent.set(id, garden);
};

beforeEach(() => {
  graph.rows.clear();
  graph.parent.clear();
  vi.clearAllMocks();
  node('home', 'garden');
  useGardenContext.getState().initialize({ id: 'home', slug: 'home' });
});

it('grows a collection as a child Garden and moves the chosen Cruxes into it', async () => {
  node('site', 'webapp', 'home');
  node('loose', 'webapp');
  const space = await createCruxspace({
    name: 'Release',
    brief: 'Ship it',
    cruxIds: ['site', 'loose'],
  });
  expect(graph.crux.create).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Release',
      description: 'Ship it',
      kind: 'garden',
      gardenId: 'home',
    }),
  );
  expect(graph.membership.move).toHaveBeenCalledWith({
    gardenId: space.id,
    memberId: 'site',
    expectedParents: ['home'],
  });
  expect(graph.membership.add).toHaveBeenCalledWith({ gardenId: space.id, memberId: 'loose' });
  expect(space).toMatchObject({ name: 'Release', brief: 'Ship it', cruxIds: ['site', 'loose'] });
});

it('lists Gardens with work, counting creative Cruxes only', async () => {
  node('studio', 'garden', 'home');
  node('poster', 'webapp', 'studio');
  node('dusk', 'mood', 'studio');
  node('inner', 'garden', 'studio');
  node('empty', 'garden', 'home');
  const spaces = await listCruxspaces();
  // Home holds only Gardens, and an empty Garden has nothing to share.
  expect(spaces.map((s) => [s.id, s.cruxIds])).toEqual([['studio', ['poster']]]);
  expect((await getCruxspace('studio')).cruxIds).toEqual(['poster']);
});

it('renames, regathers and returns left-out Cruxes to the Garden above', async () => {
  node('studio', 'garden', 'home');
  node('a', 'webapp', 'studio');
  node('b', 'webapp', 'home');
  const updated = await updateCruxspace('studio', {
    name: 'Atelier',
    brief: 'New',
    cruxIds: ['b'],
  });
  expect(updated).toMatchObject({ name: 'Atelier', brief: 'New', cruxIds: ['b'] });
  expect(graph.parent.get('a')).toBe('home');
  expect(graph.parent.get('b')).toBe('studio');
});

it('retires a Garden without deleting its Cruxes', async () => {
  node('studio', 'garden', 'home');
  node('a', 'webapp', 'studio');
  await deleteCruxspace('studio');
  expect(graph.crux.delete).toHaveBeenCalledWith('studio');
  expect(graph.crux.delete).not.toHaveBeenCalledWith('a');
  expect(graph.parent.get('a')).toBe('home');
});
