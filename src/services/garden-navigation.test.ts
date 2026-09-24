import { beforeEach, expect, it, vi } from 'vitest';
import { gardenLocation } from './garden-navigation';

const db = vi.hoisted(() => ({ get: vi.fn(), gardenMembership: { parents: vi.fn() } }));
vi.mock('./sqlite/client', () => ({ getSqliteClient: () => db }));
const parents = new Map<string, string[]>();
beforeEach(() => {
  vi.resetAllMocks();
  parents.clear();
  parents.set('low-tide', ['music']);
  parents.set('music', ['home']);
  parents.set('home', []);
  db.get.mockImplementation(async (_sql, [id]) => ({
    id,
    title: id,
    slug: id,
    kind: 'garden',
    meta: '{}',
  }));
  db.gardenMembership.parents.mockImplementation(async (id) =>
    (parents.get(id) ?? []).map((id) => ({ id })),
  );
});
it('reads an ordered complete ancestry from API parent arrays without changing location', async () => {
  const result = await gardenLocation('low-tide');
  expect(result.chain.map((item) => item.id)).toEqual(['home', 'music', 'low-tide']);
  expect(result.containers).toEqual([]);
});
it('exposes multiple containing Gardens instead of inventing a canonical ancestor', async () => {
  parents.set('music', ['home', 'studio']);
  const result = await gardenLocation('low-tide');
  expect(result.chain.map((item) => item.id)).toEqual(['music', 'low-tide']);
  expect(result.containers.map((item) => item.id)).toEqual(['home', 'studio']);
  expect(db.gardenMembership.parents.mock.calls.map(([id]) => id)).toEqual(['low-tide', 'music']);
});
it('refuses cyclic ancestry without looping or presenting a false path', async () => {
  parents.set('home', ['low-tide']);
  await expect(gardenLocation('low-tide')).rejects.toThrow('cycle');
  expect(db.gardenMembership.parents).toHaveBeenCalledTimes(3);
});
it('refuses a missing ancestor instead of silently skipping it', async () => {
  db.get.mockResolvedValueOnce({ id: 'low-tide', meta: '{}' }).mockResolvedValueOnce(undefined);
  await expect(gardenLocation('low-tide')).rejects.toThrow('no longer available');
});
it('allows a failed ancestry read to be retried using current API data', async () => {
  db.gardenMembership.parents.mockRejectedValueOnce(new Error('Connection interrupted'));
  await expect(gardenLocation('low-tide')).rejects.toThrow('Connection interrupted');
  parents.set('low-tide', ['home']);
  expect((await gardenLocation('low-tide')).chain.map((item) => item.id)).toEqual([
    'home',
    'low-tide',
  ]);
});
