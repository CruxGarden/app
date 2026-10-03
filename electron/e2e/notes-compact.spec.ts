import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { finishSetupAtHome, enterGarden, storedCrux } from './multi-crux-helpers';

test('a narrow Notes panel keeps navigation and outline usable while editing and after restart', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  try {
    let page = instance.page;
    await page.setViewportSize({ width: 1400, height: 1000 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Compact notebook');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible();
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;
    const frame = page.frameLocator('iframe[data-crux-id]');
    await expect(frame.getByLabel('Note title', { exact: true })).toHaveValue('Welcome');
    expect(await frame.locator('body').evaluate(() => innerWidth)).toBeLessThanOrEqual(980);

    await frame.getByRole('button', { name: 'Show left sidebar', exact: true }).click();
    const navigation = frame.locator('#left-navigation-panes');
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Welcome', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('compact-navigation.png') });
    expect(
      await navigation.evaluate((element) => element.getBoundingClientRect().right <= innerWidth),
    ).toBe(true);

    await frame.getByRole('button', { name: 'Show right sidebar', exact: true }).click();
    await expect(navigation).toBeHidden();
    await expect(frame.locator('#right-note-sidebar')).toBeVisible();
    await frame.getByRole('button', { name: 'Show left sidebar', exact: true }).click();
    await expect(frame.locator('#right-note-sidebar')).toBeHidden();
    await finishSetupAtHome(navigation);
    await expect(navigation).toBeHidden();

    await frame.locator('.tiptap').first().click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.insertText('Written in a narrow notebook panel.');
    await expect
      .poll(() => readFileSync(join(folder, 'notebook/Welcome.md'), 'utf8'))
      .toContain('Written in a narrow notebook panel.');

    expect(
      await page.evaluate(
        (id) =>
          window.electronAPI!.sqlite.all(
            "SELECT id FROM dimensions WHERE source_id=? AND type='growth'",
            [id],
          ),
        id,
      ),
    ).toEqual([]);
    // Resizing a real panel must update the controls, not just hide their panes in CSS.
    await page.setViewportSize({ width: 2600, height: 1100 });
    await expect.poll(() => frame.locator('body').evaluate(() => innerWidth)).toBeGreaterThan(980);
    await frame.getByRole('button', { name: 'Show left sidebar', exact: true }).click();
    await frame.getByRole('button', { name: 'Show right sidebar', exact: true }).click();
    await expect(navigation).toBeVisible();
    await expect(frame.locator('#right-note-sidebar')).toBeVisible();
    await page.setViewportSize({ width: 1400, height: 1000 });
    await expect(navigation).toBeHidden();
    await expect(frame.locator('#right-note-sidebar')).toBeHidden();
    await expect(
      frame.getByRole('button', { name: 'Show left sidebar', exact: true }),
    ).toBeVisible();

    const dir = instance.dir;
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByRole('button', { name: 'Open Compact notebook', exact: true }).click();
    const restored = page.frameLocator('iframe[data-crux-id]');
    await expect(restored.locator('.tiptap').first()).toContainText(
      'Written in a narrow notebook panel.',
    );
    await restored.getByRole('button', { name: 'Show left sidebar', exact: true }).click();
    await expect(
      restored
        .locator('#left-navigation-panes')
        .getByRole('button', { name: 'Welcome', exact: true }),
    ).toBeVisible();
  } finally {
    await instance.app.close().catch(() => {});
  }
});
