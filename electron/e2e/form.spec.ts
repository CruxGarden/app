import { test, expect, chromium } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * Form-mode editor (config.json) — the Builder's "Site settings". Typing in a
 * field must persist to disk, survive its own autosave without the form
 * resetting under the cursor (the per-keystroke save used to remount the
 * editor), round-trip through Source mode, and reach the live Astro site.
 */
test.describe('form-mode editor (site settings)', () => {
  test.setTimeout(6 * 60_000);

  test('typing persists, survives autosave, reaches the live site', async () => {
    const { app, page, dir } = await launchApp();
    const gardenRoot = join(dir, 'garden');
    const configOnDisk = (): string | null => {
      try {
        return readFileSync(
          join(gardenRoot, readdirSync(gardenRoot)[0]!, 'src/config.json'),
          'utf8',
        );
      } catch {
        return null;
      }
    };

    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Home Page/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      // Site settings → config.json opens in Form mode
      await page.getByRole('button', { name: 'Site settings' }).click({ timeout: 30_000 });
      const name = page.getByLabel('Your Name');
      await expect(name).toBeVisible({ timeout: 30_000 });
      await expect(name).toHaveValue('Your Name');

      // Type continuously across the autosave debounce — nothing may reset
      await name.fill('');
      await name.pressSequentially('Playwright Person', { delay: 40 });
      await page.waitForTimeout(700); // past the autosave debounce
      await expect(name).toHaveValue('Playwright Person'); // form didn't reset under the cursor
      await expect.poll(() => configOnDisk()).toContain('"name": "Playwright Person"'); // write-through
      await page.screenshot({ path: 'e2e/.results/form-1-settings.png' });

      // Source ↔ Form round-trip keeps the value
      await page.getByRole('button', { name: 'Source' }).click();
      await expect(page.locator('.monaco-editor').first()).toContainText('Playwright Person');
      await page.getByRole('button', { name: 'Form' }).click();
      await expect(page.getByLabel('Your Name')).toHaveValue('Playwright Person');

      // The live site (astro dev started when the tab opened) shows the name
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      const siteUrl = await preview.getAttribute('src', { timeout: 4 * 60_000 }).catch(() => null);
      // Form mode may not mount a preview iframe; the dev server is still up —
      // open the front page via the "Preview" mode to learn its URL.
      let base = siteUrl ? new URL(siteUrl).origin : null;
      if (!base) {
        await page
          .getByRole('button', { name: 'Preview' })
          .click()
          .catch(() => {});
        const src = await page
          .locator('iframe[src^="http://127.0.0.1"]')
          .getAttribute('src', { timeout: 4 * 60_000 });
        base = new URL(src!).origin;
      }
      const browser = await chromium.launch();
      try {
        const site = await browser.newPage();
        await site.goto(`${base}/`);
        await expect(
          site.getByRole('heading', { name: 'Playwright Person', level: 1 }),
        ).toBeVisible({ timeout: 30_000 });
        await site.screenshot({ path: 'e2e/.results/form-2-live-site.png' });
      } finally {
        await browser.close();
      }
    } finally {
      await app.close();
    }
  });
});
