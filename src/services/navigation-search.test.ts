import { localApiFixture } from '@/test/local-api-fixture';
import { beforeEach, expect, it, vi } from 'vitest';
import { initServices, getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { searchNavigation } from './navigation-search';
import type { CruxKind } from '@/api/types';
const native = localApiFixture();
beforeEach(async () => {
  await initServices();
});
const node = (title: string, kind?: CruxKind) => getServices().crux.create({ title, kind });
const place = (parent: string, child: string) =>
  getServices().dimension.create({
    sourceId: parent,
    targetId: child,
    type: 'garden',
    kind: 'membership',
  });
it('disambiguates equal names by actual ancestry with identity-only reads', async () => {
  const home = await node('Home', 'garden');
  const music = await node('Music', 'garden');
  const art = await node('Art', 'garden');
  const a = await node('Study');
  const b = await node('Study');
  await place(home.id, music.id);
  await place(home.id, art.id);
  await place(music.id, a.id);
  await place(art.id, b.id);
  const blobs = vi.spyOn(getSqliteClient(), 'blobRead');
  const result = await searchNavigation('study');
  expect(result.items.map((r) => r.location).sort()).toEqual(['Home › Art', 'Home › Music']);
  expect(result.items.every((r) => r.locationState === 'ready')).toBe(true);
  expect(blobs).not.toHaveBeenCalled();
});
it('keeps unplaced or ambiguous content discoverable without inventing a path, and stops cycles', async () => {
  const a = await node('A', 'garden');
  const b = await node('B', 'garden');
  const item = await node('Study');
  expect((await searchNavigation('Study')).items[0]?.locationState).toBe('unplaced');
  await place(a.id, item.id);
  await place(b.id, item.id);
  expect((await searchNavigation('Study')).items[0]?.locationState).toBe('ambiguous');
  await native().faultSql('DELETE FROM dimensions WHERE source_id = ?', [b.id]);
  await place(b.id, a.id);
  await place(a.id, b.id);
  expect((await searchNavigation('Study')).items[0]?.locationState).toBe('cycle');
});
it('matches literal text, pages equal titles without repeats, and excludes retained versions and unplaced tool packages', async () => {
  for (let i = 0; i < 24; i++) await node('Study');
  await node('Study', 'snapshot');
  await node('Study', 'tool');
  await node('100%');
  await node('1000');
  const first = await searchNavigation('Study');
  expect(first.items).toHaveLength(20);
  const second = await searchNavigation('Study', first.next!);
  expect(second.items).toHaveLength(4);
  expect(new Set([...first.items, ...second.items].map((r) => r.id)).size).toBe(24);
  expect((await searchNavigation('%')).items.map((r) => r.title)).toEqual(['100%']);
  expect((await searchNavigation('  ')).items).toEqual([]);
});
it('does not expose deleted ancestor titles or claim a complete excessively deep location', async () => {
  const home = await node('Hidden ancestor', 'garden');
  const item = await node('Study');
  await place(home.id, item.id);
  await native().faultSql('UPDATE cruxes SET deleted = ? WHERE id = ?', ['gone', home.id]);
  const result = await searchNavigation('Study');
  expect(result.items[0]?.locationState).toBe('unavailable');
  expect(JSON.stringify(result)).not.toContain('Hidden ancestor');
});
it('bounds deep location traversal rather than returning a false partial path', async () => {
  const item = await node('Only match');
  let child = item.id;
  for (let i = 0; i < 260; i++) {
    const parent = await node(`Ancestor ${i}`, 'garden');
    await place(parent.id, child);
    child = parent.id;
  }
  expect((await searchNavigation('Only match')).items[0]?.locationState).toBe('limited');
});
