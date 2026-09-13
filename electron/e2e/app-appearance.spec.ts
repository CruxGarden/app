import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/** The actual Tigrana (ADR 0040) follows live Garden Moods without reloading the draft; the App appearance choice persists. */
test('Notes follows live Garden Moods without reloading drafts; app appearance persists', async () => {
  test.setTimeout(180000);
  let instance = await launchApp();
  const dir = instance.dir;
  const evidence = resolve(__dirname, '../../docs/app-integrations');
  mkdirSync(evidence, { recursive: true });
  const frame = () => instance.page.frameLocator('iframe[data-crux-id]');
  const status = () => frame().locator('#garden-project [role=status]');
  const editor = () => frame().locator('.tiptap').first();
  try {
    let page = instance.page;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Notes/ }).click();
    await page.getByLabel('Name', { exact: true }).fill('Mood notebook');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(status()).toHaveText('Saved', { timeout: 120000 });
    await expect(frame().locator('html')).toHaveAttribute('data-garden-mood', 'true');
    await frame().getByRole('button', { name: 'Welcome', exact: true }).first().click();
    await editor().click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' This draft survives a change of atmosphere.');
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
      // Tigrana takes the Mood's background (accent and type stay the notebook's own, ADR 0029).
      const bg = await page
        .locator('html')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--bg').trim());
      await expect
        .poll(() =>
          frame()
            .locator('html')
            .evaluate((el) => getComputedStyle(el).getPropertyValue('--app-bg').trim()),
        )
        .toBe(bg);
      await expect(frame().locator('html')).toHaveAttribute('data-instance', 'same-editor');
      await expect(editor()).toContainText('survives a change');
      await page.screenshot({ path: join(evidence, `notes-${mood}.png`) });
    }
    // App appearance: the Mood's background leaves the root; Tigrana's own theme decides.
    const moodBg = await frame()
      .locator('html')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--app-bg').trim());
    await frame().getByLabel('App appearance', { exact: true }).selectOption('app');
    await expect
      .poll(() =>
        frame()
          .locator('html')
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--app-bg').trim()),
      )
      .not.toBe(moodBg);
    await expect(frame().locator('html')).not.toHaveAttribute('data-garden-mood', 'true');
    await expect(status()).toHaveText('Saved');
    await instance.app.close();
    instance = await launchApp({ dir });
    page = instance.page;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 2000, height: 1200 });
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(frame().getByLabel('App appearance', { exact: true })).toHaveValue('app', {
      timeout: 120000,
    });
    await frame().getByRole('button', { name: 'Welcome', exact: true }).first().click();
    await expect(editor()).toContainText('survives a change');
    await frame().getByLabel('App appearance', { exact: true }).selectOption('garden');
    await expect(frame().locator('html')).toHaveAttribute('data-garden-mood', 'true');
  } finally {
    await instance.app.close();
  }
});
