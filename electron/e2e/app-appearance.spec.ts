import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

test('Notes follows live Garden Moods without reloading drafts; app appearance persists', async () => {
  test.setTimeout(180000);
  let instance = await launchApp();
  const dir = instance.dir;
  const evidence = resolve(__dirname, '../../docs/app-integrations');
  mkdirSync(evidence, { recursive: true });
  try {
    let page = instance.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Mood notebook');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const frame = () => page.frameLocator('iframe[data-crux-id]');
    await expect(frame().getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible({
      timeout: 120000,
    });
    await expect(frame().locator('html')).toHaveAttribute('data-garden-mood', 'true');
    const editor = () => frame().locator('.tiptap[contenteditable=true]').first();
    await editor().fill('This draft survives a change of atmosphere.');
    await frame()
      .locator('html')
      .evaluate((el) => el.setAttribute('data-instance', 'same-editor'));
    for (const mood of ['8-bit', 'siberian-blizzard', 'silent-hill']) {
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByTestId(`bundled-${mood}`).getByRole('button', { name: 'Apply' }).click();
      await page
        .locator('[data-modal-open]')
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      await expect(page.locator('[data-modal-open]')).toHaveCount(0);
      const accent = await page
        .locator('html')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--accent').trim());
      await expect
        .poll(() =>
          frame()
            .locator('html')
            .evaluate((el) => getComputedStyle(el).getPropertyValue('--accent').trim()),
        )
        .toBe(accent);
      await expect(frame().locator('html')).toHaveAttribute('data-instance', 'same-editor');
      await expect(editor()).toContainText('survives a change');
      await page.screenshot({ path: join(evidence, `notes-${mood}.png`) });
    }
    await frame().getByLabel('App appearance', { exact: true }).selectOption('app');
    await expect
      .poll(() =>
        frame()
          .locator('html')
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--bg').trim()),
      )
      .toBe('#171d1c');
    await frame().getByRole('button', { name: 'Save now', exact: true }).click();
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(frame().getByLabel('App appearance', { exact: true })).toHaveValue('app', {
      timeout: 60000,
    });
    await expect(editor()).toContainText('survives a change');
    await frame().getByLabel('App appearance', { exact: true }).selectOption('garden');
    await expect(frame().locator('html')).toHaveAttribute('data-garden-mood', 'true');
  } finally {
    await instance.app.close();
  }
});
