import { beforeEach, expect, it, vi } from 'vitest';
import { initServices, getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import {
  readNavigationPreferences,
  saveGardenNavigation,
  saveUserNavigation,
} from './navigation-preferences';
beforeEach(async () => {
  await initServices();
  await getSqliteClient().run('ALTER TABLE dimensions ADD COLUMN deleted TEXT');
});
const garden = (title: string) => getServices().crux.create({ title, kind: 'garden' });
const place = (parent: string, child: string) =>
  getServices().dimension.create({
    sourceId: parent,
    targetId: child,
    type: 'garden',
    kind: 'membership',
  });
it('resolves app, user, nearest Garden, last choice and forced user defaults in order', async () => {
  const root = await garden('Home');
  const child = await garden('Studio');
  await place(root.id, child.id);
  expect((await readNavigationPreferences('alice', child.id)).view).toBe('tree');
  await saveUserNavigation('alice', { defaultView: 'neighborhood' });
  expect((await readNavigationPreferences('alice', child.id)).source).toBe('Your default');
  await saveGardenNavigation(root.id, 'tree');
  expect(await readNavigationPreferences('alice', child.id)).toMatchObject({
    view: 'tree',
    source: 'Home',
  });
  await saveGardenNavigation(child.id, 'neighborhood');
  expect((await readNavigationPreferences('alice', child.id)).source).toBe('Studio');
  await saveUserNavigation('alice', { gardenId: child.id, view: 'tree' });
  expect((await readNavigationPreferences('alice', child.id)).source).toBe(
    'Your choice in this Garden',
  );
  expect((await readNavigationPreferences('alice', child.id, 'neighborhood')).view).toBe('tree');
  await saveUserNavigation('alice', { always: true });
  expect(await readNavigationPreferences('alice', child.id)).toMatchObject({
    view: 'neighborhood',
    source: 'Your view everywhere',
  });
  await saveUserNavigation('alice', { always: false, gardenId: child.id, view: null });
  await saveGardenNavigation(child.id, null);
  expect((await readNavigationPreferences('alice', child.id)).source).toBe('Home');
});
it('isolates people and Gardens, serializes simultaneous choices, and never writes them into portable Garden metadata', async () => {
  const a = await garden('A');
  const b = await garden('B');
  await Promise.all([
    saveUserNavigation('alice', { gardenId: a.id, view: 'neighborhood' }),
    saveUserNavigation('alice', { gardenId: b.id, view: 'neighborhood' }),
  ]);
  expect((await readNavigationPreferences('alice', a.id)).view).toBe('neighborhood');
  expect((await readNavigationPreferences('alice', b.id)).view).toBe('neighborhood');
  expect((await readNavigationPreferences('bob', a.id)).view).toBe('tree');
  expect((await getServices().crux.findById(a.id)).meta?.navigation).toBeUndefined();
});
it('retains unrelated Garden metadata and treats an explicit link as a visit, below the always override', async () => {
  const a = await garden('A');
  await getServices().crux.update(a.id, { meta: { brief: 'keep' } });
  await saveGardenNavigation(a.id, 'neighborhood');
  expect((await getServices().crux.findById(a.id)).meta?.brief).toBe('keep');
  expect((await readNavigationPreferences('alice', a.id, 'tree')).view).toBe('tree');
  expect((await readNavigationPreferences('alice', a.id)).view).toBe('neighborhood');
  await saveUserNavigation('alice', { always: true, defaultView: 'neighborhood' });
  expect((await readNavigationPreferences('alice', a.id, 'tree')).view).toBe('neighborhood');
});
it('refuses ambiguous and cyclic inheritance, deleted owners and unsupported preferences without inventing fallback', async () => {
  const a = await garden('A');
  const b = await garden('B');
  const c = await garden('C');
  await place(a.id, c.id);
  await place(b.id, c.id);
  await expect(readNavigationPreferences('alice', c.id)).rejects.toThrow('multiple');
  await getSqliteClient().run('DELETE FROM dimensions WHERE source_id = ?', [b.id]);
  await place(c.id, a.id);
  await expect(readNavigationPreferences('alice', c.id)).rejects.toThrow('cycle');
  await saveGardenNavigation(c.id, 'tree');
  expect((await readNavigationPreferences('alice', c.id)).view).toBe('tree');
  await getServices().crux.update(c.id, { meta: { navigation: { version: 99, view: 'tree' } } });
  await expect(readNavigationPreferences('alice', c.id)).rejects.toThrow('unsupported');
  await expect(saveGardenNavigation(c.id, 'tree')).rejects.toThrow('unsupported');
  await getServices().crux.trash(b.id);
  await expect(saveGardenNavigation(b.id, 'tree')).rejects.toThrow('unavailable');
});
it('does not report a failed preference save as successful and can retry it', async () => {
  const a = await garden('A');
  const db = getSqliteClient();
  const run = vi.spyOn(db, 'run');
  run.mockRejectedValueOnce(new Error('Disk unavailable'));
  await expect(
    saveUserNavigation('alice', { gardenId: a.id, view: 'neighborhood' }),
  ).rejects.toThrow('Disk unavailable');
  expect((await readNavigationPreferences('alice', a.id)).view).toBe('tree');
  await saveUserNavigation('alice', { gardenId: a.id, view: 'neighborhood' });
  expect((await readNavigationPreferences('alice', a.id)).view).toBe('neighborhood');
});

it('detects ignored settings writes and keeps author intent portable without personal choices', async () => {
  const a = await garden('A');
  await saveGardenNavigation(a.id, 'neighborhood');
  const { portableMeta } = await import('./task-archive');
  const portable = portableMeta((await getServices().crux.findById(a.id)).meta);
  expect(portable.navigation).toEqual({ version: 1, view: 'neighborhood' });
  await getSqliteClient().run(
    "CREATE TRIGGER ignore_navigation BEFORE INSERT ON settings WHEN NEW.key LIKE 'cruxgarden:navigation:%' BEGIN SELECT RAISE(IGNORE); END",
  );
  await expect(saveUserNavigation('alice', { gardenId: a.id, view: 'tree' })).rejects.toThrow(
    'not saved',
  );
  expect((await readNavigationPreferences('alice', a.id)).view).toBe('neighborhood');
  await getSqliteClient().run('DROP TRIGGER ignore_navigation');
  await saveUserNavigation('alice', { gardenId: a.id, view: 'tree' });
  expect(portableMeta((await getServices().crux.findById(a.id)).meta)).toEqual(portable);
});
