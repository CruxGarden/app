import type { CruxKind } from '@/api/types';
import { beforeEach, expect, it, vi } from 'vitest';
import { initServices, getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { navigationNeighborhood, navigationVersionTarget } from './navigation-neighborhood';

beforeEach(async () => {
  await initServices('local');
  // The shared unit harness uses the parked web schema; desktop API Dimensions
  // already have tombstones. Mirror that column for these read projections.
  await getSqliteClient().run('ALTER TABLE dimensions ADD COLUMN deleted TEXT');
});
const node = (title: string, kind?: CruxKind) => getServices().crux.create({ title, kind });
const edge = (
  sourceId: string,
  targetId: string,
  type: 'garden' | 'growth' | 'graft' | 'gate',
  kind?: string,
) => getServices().dimension.create({ sourceId, targetId, type, kind });
it('projects incoming placement as Gate without rewriting edge identity or confusing lateral links with children', async () => {
  const home = await node('Home', 'garden');
  const a = await node('Song');
  const b = await node('Reference');
  const placed = await edge(home.id, a.id, 'garden', 'membership');
  const graft = await edge(b.id, a.id, 'graft');
  const readBlob = vi.spyOn(getSqliteClient(), 'blobRead');
  const result = await navigationNeighborhood(a.id);
  expect(result.links).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: placed.id,
        type: 'garden',
        group: 'gate',
        direction: 'incoming',
        node: expect.objectContaining({ id: home.id }),
      }),
      expect.objectContaining({
        id: graft.id,
        type: 'graft',
        group: 'graft',
        direction: 'incoming',
        node: expect.objectContaining({ id: b.id }),
      }),
    ]),
  );
  expect(readBlob).not.toHaveBeenCalled();
  expect(result.links).toHaveLength(2);
  expect((await navigationNeighborhood(home.id)).links[0]).toMatchObject({
    id: placed.id,
    group: 'garden',
    direction: 'outgoing',
  });
});
it('pages bounded neighborhoods without dropping same-node relationships or following cycles', async () => {
  const a = await node('A');
  const b = await node('B');
  for (let i = 0; i < 55; i++) await edge(a.id, b.id, 'graft');
  await edge(b.id, a.id, 'graft');
  const first = await navigationNeighborhood(a.id);
  expect(first.links).toHaveLength(50);
  expect(first.next).toBeTruthy();
  const second = await navigationNeighborhood(a.id, first.next!);
  expect(second.links).toHaveLength(6);
  expect(second.next).toBeNull();
  expect(new Set([...first.links, ...second.links].map((l) => l.id)).size).toBe(56);
});
it('omits deleted edges and preserves an unavailable endpoint without exposing its metadata', async () => {
  const a = await node('A');
  const b = await node('Private removed title');
  const e = await edge(a.id, b.id, 'graft');
  const db = getSqliteClient();
  await db.run('UPDATE cruxes SET deleted = ? WHERE id = ?', ['gone', b.id]);
  const result = await navigationNeighborhood(a.id);
  expect(result.links[0]).toMatchObject({ node: { id: b.id }, available: false });
  expect(JSON.stringify(result)).not.toContain('Private removed title');
  await db.run('UPDATE dimensions SET deleted = ? WHERE id = ?', ['gone', e.id]);
  expect((await navigationNeighborhood(a.id)).links).toEqual([]);
  await expect(navigationNeighborhood(b.id)).rejects.toThrow('unavailable');
});
it('opens retained versions through their owner and refuses ambiguous or missing ownership', async () => {
  const a = await node('Main');
  const b = await node('Other');
  const version = await node('Demo', 'snapshot');
  await edge(a.id, version.id, 'growth');
  expect(await navigationVersionTarget(version.id)).toEqual({ cruxId: a.id, growthId: version.id });
  await edge(b.id, version.id, 'growth');
  await expect(navigationVersionTarget(version.id)).rejects.toThrow('owner');
});
