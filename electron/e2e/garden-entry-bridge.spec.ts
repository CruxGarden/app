import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('the packaged API supplies one local Garden entry across renderer calls and restart', async () => {
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    await enterGarden(instance.page);
    const roots = await instance.page.evaluate(() =>
      Promise.all([
        window.electronAPI!.sqlite.enterLocalGarden!(),
        window.electronAPI!.sqlite.enterLocalGarden!(),
      ]),
    );
    expect(roots[0]).toEqual(roots[1]);
    expect(roots[0]).toMatchObject({ title: 'My Garden', kind: 'garden' });
    const project = await createCrux(instance.page, 'Entry project');
    const before = await instance.page.evaluate(
      async ({ root, project }) => {
        const db = window.electronAPI!.sqlite;
        const before = await db.gardenMembership!.list(root);
        await db.gardenMembership!.add({ gardenId: root, memberId: project });
        await db.updateCrux!(root, { title: 'Local studio' });
        const errors: string[] = [];
        for (const operation of [
          () => db.setCruxTrashed!(root, true),
          () => db.deleteCrux!(root),
        ]) {
          try {
            await operation();
            errors.push('NOT REFUSED');
          } catch (error) {
            errors.push((error as Error).message);
          }
        }
        return { before, errors };
      },
      { root: roots[0].id, project },
    );
    expect(before.before.items).toEqual([]);
    expect(before.errors).toHaveLength(2);
    for (const error of before.errors) expect(error).toContain('local Garden entry');
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    const restored = await instance.page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const root = await db.enterLocalGarden!();
      return { root, members: await db.gardenMembership!.list(root.id) };
    });
    expect(restored.root).toEqual({ ...roots[0], title: 'Local studio' });
    expect(restored.members.items.map((item) => item.id)).toEqual([project]);
  } finally {
    await instance.app.close().catch(() => {});
  }
});
