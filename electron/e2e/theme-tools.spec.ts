import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * The AI can restyle the workspace: a scripted turn calls set_theme in preview
 * mode; the Collaboration pane and the accent change in the real chrome, the
 * saved theme is untouched, and the Mood Builder shows a way to clear it.
 */
test.describe('theme tools (mock AI)', () => {
  test('a chat turn tints the workspace without saving it', async () => {
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      const collab = page.locator('.mosaic-window.pane-collaboration');
      await expect(collab).toBeVisible({ timeout: 30_000 });
      const before = await collab
        .locator('.mosaic-window-body')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);

      const input = page.getByPlaceholder('Send a message...');
      await input.fill('paint the workspace while you work');
      await input.press('Enter');
      await expect(page.getByText('Done — I painted it.')).toBeVisible({ timeout: 30_000 });

      // Body: the pane's own surface token. Frame: a gradient border, 3px.
      await expect(collab.locator('.mosaic-window-body').first()).toHaveCSS(
        'background-color',
        'rgb(17, 34, 51)',
      );
      await expect(collab).toHaveCSS('background-image', /linear-gradient\(135deg/);
      await expect(collab).toHaveCSS('padding-left', '3px');
      const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      );
      expect(accent).toBe('#ff2d95');
      await page.screenshot({ path: 'e2e/.results/theme-tools-1-painted.png' });

      // Preview, not a saved theme: the Mood Builder offers to clear it
      await page.getByRole('button', { name: 'Mood' }).click();
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await expect(page.getByText(/AI preview: 4 tokens/)).toBeVisible();
      await expect(page.getByText(/\b0 custom\b|custom/)).toHaveCount(0);
      await page.getByRole('button', { name: /AI preview/ }).click();
      await expect(page.getByText(/AI preview/)).toHaveCount(0);
      await page.getByRole('button', { name: 'Done' }).click();
      await expect(collab.locator('.mosaic-window-body').first()).toHaveCSS(
        'background-color',
        before,
      );
      await expect(collab).not.toHaveCSS('background-image', /linear-gradient/);
    } finally {
      await app.close();
    }
  });
});
