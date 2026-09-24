import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { addArtifact, createCrux, enterGarden, storedCrux } from './multi-crux-helpers';
import { togglePanel } from './panel-helpers';

test('an interrupted restore resumes on startup without an old workspace save replacing its branch', async () => {
  let launch = await launchApp();
  const { page, dir } = launch;
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Restore recovery');
    const meta = await storedCrux(page, id);
    await addArtifact(page, 'note.txt');
    const editor = page.locator('.monaco-editor').first();
    const disk = () => readFileSync(join(meta.projectFolder, 'note.txt'), 'utf8');
    await togglePanel(page, 'Toggle history');
    const history = page.getByTestId('pane-body-history');
    for (const text of ['Earlier', 'Later']) {
      await editor.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(text);
      await page.keyboard.press('ControlOrMeta+s');
      await expect.poll(disk).toBe(text);
      await history.getByRole('button', { name: 'Mark version', exact: true }).click();
      await history.getByPlaceholder('Label (optional)').fill(text);
      await history.getByPlaceholder('Label (optional)').press('Enter');
      await expect(history.getByText(text, { exact: true })).toBeVisible();
    }
    const earlier = await page.evaluate(async (id) => {
      return (
        (await window.electronAPI!.sqlite.get(
          "SELECT target_id FROM dimensions WHERE source_id = ? AND json_extract(meta, '$.label') = 'Earlier'",
          [id],
        )) as { target_id: string }
      ).target_id;
    }, id);
    await history.getByText('Earlier', { exact: true }).click();
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER hold_projection BEFORE DELETE ON settings WHEN OLD.key LIKE 'cruxgarden:content-projection:%' BEGIN SELECT RAISE(IGNORE); END",
      ),
    );
    await page.getByRole('button', { name: 'Revert', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revert', exact: true }).click();
    await expect(page.getByRole('alertdialog', { name: 'Restore failed' })).toBeVisible();
    await expect.poll(disk).toBe('Earlier');
    expect((await storedCrux(page, id)).settings.activeBranch).toBe(earlier);
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER hold_projection'));
    await launch.app.close();
    launch = await launchApp({ dir });
    await launch.page.getByRole('button', { name: /enter/i }).click();
    await expect(launch.page.locator('[data-workspace-id]')).toBeVisible();
    expect((await storedCrux(launch.page, id)).settings.activeBranch).toBe(earlier);
    expect(disk()).toBe('Earlier');
    const state = await launch.page.evaluate(
      async (id) => ({
        pending: await window.electronAPI!.sqlite.all(
          "SELECT key FROM settings WHERE key LIKE 'cruxgarden:content-projection:%'",
        ),
        files: await window.electronAPI!.sqlite.all('SELECT id FROM artifacts'),
        growth: await window.electronAPI!.sqlite.all(
          "SELECT id FROM dimensions WHERE source_id = ? AND type = 'growth'",
          [id],
        ),
      }),
      id,
    );
    expect(state.pending).toEqual([]);
    expect(state.files).toEqual([]);
    expect(state.growth).toHaveLength(3);
  } finally {
    await launch.app.close();
  }
});

test('a captured preview appears on its Garden card with files held only in manifests', async () => {
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Captured preview');
    await addArtifact(page, 'index.html');
    await page.locator('.monaco-editor').first().click();
    await page.keyboard.type('<h1>A visible creation</h1>');
    await page.keyboard.press('ControlOrMeta+s');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.frameLocator('iframe[data-crux-id]').getByRole('heading')).toHaveText(
      'A visible creation',
    );
    await page.getByTitle('Capture preview (saves as preview.jpg)').click();
    await page.locator('header').getByRole('button').first().click();
    const image = page
      .getByRole('button', { name: 'Open Captured preview', exact: true })
      .locator('img');
    await expect(image).toBeVisible({ timeout: 30000 });
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    expect(
      await page.evaluate(() => window.electronAPI!.sqlite.all('SELECT id FROM artifacts')),
    ).toEqual([]);
  } finally {
    await app.close();
  }
});
