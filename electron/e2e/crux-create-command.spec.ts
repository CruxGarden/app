import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, addArtifact } from './multi-crux-helpers';
const env = { CRUX_API_OWNER: '1' };

test('normal creation reports a folder failure, retries through the owner, then reopens saved work', async () => {
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    let page = launch.page;
    await enterGarden(page);
    await launch.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { ProjectFolders } = load('./dist/projects.js');
      const original = ProjectFolders.prototype.createFolder;
      ProjectFolders.prototype.createFolder = function (slug: string) {
        if (slug.startsWith('retry-creation-')) {
          ProjectFolders.prototype.createFolder = original;
          throw new Error('Test disk preparation refused');
        }
        return original.call(this, slug);
      };
    });
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Blank/ }).click();
    await page.getByPlaceholder('My Crux').fill('Retry creation');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Test disk preparation refused');
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all('SELECT id FROM cruxes WHERE title = ?', ['Retry creation']),
      ),
    ).toEqual([]);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await addArtifact(page, 'saved.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Creation survives restart');
    await page.keyboard.press('ControlOrMeta+s');
    const folder = await page.evaluate(async (id) => {
      const row = (await window.electronAPI!.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [
        id,
      ])) as { meta: string };
      return JSON.parse(row.meta).projectFolder as string;
    }, id);
    await expect
      .poll(() =>
        launch.app.evaluate((_e, folder) => {
          const fs = process.getBuiltinModule('fs');
          const path = process.getBuiltinModule('path');
          return fs.readFileSync(path.join(folder, 'saved.txt'), 'utf8');
        }, folder),
      )
      .toBe('Creation survives restart');
    await launch.app.close();
    launch = await launchApp({ dir, env });
    page = launch.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', id);
    await page.getByRole('tree').getByText('saved.txt', { exact: true }).click();
    await expect(page.locator('.monaco-editor')).toContainText('Creation survives restart');
  } finally {
    await launch.app.close();
  }
});

test('concurrent creation skips existing folders and symlinks, retains prepared content after rollback, and restarts', async () => {
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    await enterGarden(launch.page);
    const kept = await launch.app.evaluate(() => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const root = process.env.CRUX_GARDEN_ROOT!;
      fs.mkdirSync(root, { recursive: true });
      const existing = path.join(root, 'parallel');
      fs.mkdirSync(existing);
      fs.writeFileSync(path.join(existing, 'private.txt'), 'Do not adopt');
      fs.symlinkSync(existing, path.join(root, 'parallel-2'));
      return existing;
    });
    const ids = await launch.page.evaluate(async () => {
      const db = window.electronAPI!.sqlite;
      const ids = await Promise.all(
        Array.from({ length: 4 }, () =>
          db.createCrux!({
            slug: 'parallel',
            title: 'Parallel',
            type: 'workspace',
            authorId: crypto.randomUUID(),
            homeId: crypto.randomUUID(),
          }),
        ),
      );
      await db.run(
        "CREATE TRIGGER refuse_creation BEFORE INSERT ON cruxes WHEN NEW.slug = 'recover' BEGIN SELECT RAISE(ABORT, 'No insert'); END",
      );
      let failed = false;
      try {
        await db.createCrux!({
          slug: 'recover',
          type: 'workspace',
          authorId: crypto.randomUUID(),
          homeId: crypto.randomUUID(),
        });
      } catch {
        failed = true;
      }
      if (!failed) throw new Error('Expected creation refusal');
      if ((await db.all("SELECT id FROM cruxes WHERE slug = 'recover'")).length)
        throw new Error('Partial record committed');
      await db.run('DROP TRIGGER refuse_creation');
      return ids;
    });
    await launch.app.evaluate(() => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      fs.writeFileSync(
        path.join(process.env.CRUX_GARDEN_ROOT!, 'recover', 'retained.txt'),
        'Retained after rollback',
      );
    });
    const recoveryId = await launch.page.evaluate(() =>
      window.electronAPI!.sqlite.createCrux!({
        slug: 'recover',
        type: 'workspace',
        authorId: crypto.randomUUID(),
        homeId: crypto.randomUUID(),
      }),
    );
    await launch.app.close();
    launch = await launchApp({ dir, env });
    const rows = await launch.page.evaluate(
      async (ids) => {
        const db = window.electronAPI!.sqlite;
        return Promise.all(
          ids.map(async (id) => {
            const row = (await db.get('SELECT slug, meta FROM cruxes WHERE id = ?', [id])) as {
              slug: string;
              meta: string;
            };
            return { slug: row.slug, folder: JSON.parse(row.meta).projectFolder as string };
          }),
        );
      },
      [...ids, recoveryId],
    );
    expect(rows.map((row) => row.slug)).toEqual([
      'parallel',
      'parallel-2',
      'parallel-3',
      'parallel-4',
      'recover',
    ]);
    expect(new Set(rows.map((row) => row.folder)).size).toBe(5);
    expect(rows.every((row) => row.folder !== kept && row.folder !== `${kept}-2`)).toBe(true);
    expect(rows.at(-1)!.folder).toMatch(/recover-2$/);
    expect(
      await launch.app.evaluate((_e, kept) => {
        const fs = process.getBuiltinModule('fs');
        const path = process.getBuiltinModule('path');
        return [
          fs.readFileSync(path.join(kept, 'private.txt'), 'utf8'),
          fs.readFileSync(
            path.join(process.env.CRUX_GARDEN_ROOT!, 'recover', 'retained.txt'),
            'utf8',
          ),
        ];
      }, kept),
    ).toEqual(['Do not adopt', 'Retained after rollback']);
  } finally {
    await launch.app.close();
  }
});
