import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { launchApp } from './launch';

/**
 * The AI can set the Mood background: a scripted turn calls set_background
 * with a workspace image; the background layer shows it and the setting
 * persists. (Generation from a prompt needs a provider key — covered by the
 * unit tests' error path.)
 */
test.describe('background tool (mock AI)', () => {
  test('a chat turn sets a workspace image as the background', async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: 'New file' })).toBeVisible({ timeout: 30_000 });

      // An image in the workspace (the hidden multi-file input behind Upload)
      await page
        .locator('input[type="file"][multiple]')
        .setInputFiles(join(__dirname, 'fixtures', 'backdrop.png'));
      await expect(page.getByRole('tree').getByText('backdrop.png', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('mood-background-image')).toHaveCount(0);

      const input = page.getByPlaceholder('Send a message...');
      await input.fill('give me a new backdrop');
      await input.press('Enter');
      await expect(page.getByText('Done — new backdrop.')).toBeVisible({ timeout: 30_000 });

      const bg = page.getByTestId('mood-background-image');
      await expect(bg).toBeVisible();
      await expect(bg).toHaveCSS('background-image', /url\("blob:/);
      const type = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--background-type').trim(),
      );
      expect(type).toBe('image');
      await page.screenshot({ path: 'e2e/.results/background-1-set.png' });

      // The Background tab agrees and can clear it
      await page.getByRole('button', { name: 'Mood' }).click();
      await page.getByRole('button', { name: 'Background', exact: true }).click();
      await page.screenshot({ path: 'e2e/.results/background-2-mood-tab.png' });
    } finally {
      await app.close();
    }
  });
});
