import { test, expect } from '@playwright/test';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, createCrux, goHome } from './multi-crux-helpers';
import { exportNativeCrux } from './native-archive-helpers';
import { enableAdvancedMode, openPanel, showPane, togglePanel } from './panel-helpers';

test('OS opens queue all three packages through reviewed import, deduplicate and report malformed files', async () => {
  test.setTimeout(180_000);
  const source = await launchApp({ ai: false });
  const project = join(source.dir, 'hello.crux');
  const tool = join(source.dir, 'notes.cruxtool');
  const mood = join(source.dir, 'quiet.cruxmood');
  try {
    await enterGarden(source.page);
    await enableAdvancedMode(source.page);
    await createCrux(source.page, 'Opened from disk');
    await exportNativeCrux(source.page, project, source.app, () =>
      togglePanel(source.page, 'Toggle export'),
    );
    await goHome(source.page);
    await source.page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await source.page.getByLabel('Find a starting point').fill('Make a tool');
    await source.page.locator('[data-template-id="tool-starter"]').click();
    await source.page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(source.page.locator('iframe[data-crux-id]')).toBeVisible();
    await openPanel(source.page, 'details', 'Toggle details');
    const kind = source.page.getByRole('button', {
      name: /^(auto|Web App|Page|Document|Image|Tool template)$/i,
    });
    for (let i = 0; i < 8 && !/Tool template/i.test(await kind.innerText()); i++)
      await kind.click();
    await expect(kind).toHaveText('Tool template');
    await openPanel(source.page, 'export', 'Toggle export');
    await source.app.evaluate(({ session }, path) => {
      session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path));
    }, tool);
    await source.page.getByRole('button', { name: 'Export Tool (.cruxtool)', exact: true }).click();
    await expect.poll(() => existsSync(tool)).toBe(true);
    await showPane(source.page, 'Mood');
    await source.page.getByRole('button', { name: 'Save current as Mood' }).click();
    await source.page.getByRole('textbox', { name: 'Mood name' }).fill('Quiet disk');
    await source.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      source.page.getByRole('button', { name: 'Export Quiet disk', exact: true }),
    ).toBeVisible();
    await source.app.evaluate(({ session }, path) => {
      session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path));
    }, mood);
    await source.page.getByRole('button', { name: 'Export Quiet disk', exact: true }).click();
    await expect.poll(() => existsSync(mood)).toBe(true);
  } finally {
    await source.app.close();
  }

  const target = await launchApp({ ai: false, openFiles: [project, tool, mood, project] });
  const { page, app } = target;
  try {
    await enterGarden(page);
    const prompt = page.getByRole('dialog', { name: 'Import downloaded package' });
    await expect(prompt).toContainText('hello.crux');
    expect((await page.evaluate(() => window.electronAPI!.packageImports!.pending())).length).toBe(
      3,
    );
    await prompt.getByRole('button', { name: 'Import package' }).click();
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Opened from disk',
    );
    await expect(prompt).toContainText('notes.cruxtool');
    await prompt.getByRole('button', { name: 'Import package' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Tool installed' })).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(prompt).toContainText('quiet.cruxmood');
    await prompt.getByRole('button', { name: 'Import package' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Mood installed' })).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await showPane(page, 'Mood');
    await expect(page.getByRole('button', { name: 'Apply Quiet disk', exact: true })).toBeVisible();
    const broken = join(target.dir, 'broken.cruxtool');
    writeFileSync(broken, 'not a package');
    // macOS open-file and Windows/Linux second-instance use the same admission queue.
    await app.evaluate(
      ({ app }, file) => app.emit('open-file', { preventDefault() {} }, file),
      broken,
    );
    await expect(prompt).toContainText('broken.cruxtool');
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await app.evaluate(
      ({ app }, file) => app.emit('second-instance', {}, ['Crux Garden', file], process.cwd()),
      broken,
    );
    await expect(prompt).toContainText('broken.cruxtool');
    await prompt.getByRole('button', { name: 'Import package' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Import failed' })).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    expect(
      (
        await page.evaluate(() =>
          window.electronAPI!.sqlite.all(
            "SELECT id FROM cruxes WHERE title = 'Opened from disk' AND deleted IS NULL",
          ),
        )
      ).length,
    ).toBe(1);
  } finally {
    await app.close();
  }
});
