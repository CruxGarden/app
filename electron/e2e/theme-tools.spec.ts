import { finishSetupAtHome } from './multi-crux-helpers';
import { showPane, hidePane } from './panel-helpers';
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
      await finishSetupAtHome(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      const collab = page.locator('.mosaic-window.pane-collaboration');
      await expect(collab).toBeVisible({ timeout: 30_000 });
      // The pane body's paint is the Mood's business (Plasma frosts it over
      // the ground); the token the tool sets is what the pane resolves.
      const body = collab.locator('.mosaic-window-body').first();
      const panel = () =>
        body.evaluate((el) => getComputedStyle(el).getPropertyValue('--panel').trim());
      const before = await panel();

      const input = page.getByPlaceholder('Send a message...');
      await input.fill('paint the workspace while you work');
      await input.press('Enter');
      await expect(page.getByText('Done — I painted it.')).toBeVisible({ timeout: 30_000 });

      // Body: the pane's own surface token. Frame: a gradient border, 3px.
      await expect.poll(panel).toBe('#112233');
      // Plasma paints the frame its own way: the tokens the pane resolves are the claim.
      const token = (name: string) =>
        collab.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
      await expect.poll(() => token('--border')).toContain('linear-gradient(135deg');
      await expect.poll(() => token('--pane-border-width')).toBe('3px');
      const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      );
      expect(accent).toBe('#ff2d95');
      await page.screenshot({ path: 'e2e/.results/theme-tools-1-painted.png' });

      // Preview, not a saved theme: the Mood pane offers to clear it
      const mood = await showPane(page, 'Mood');
      await mood.getByRole('button', { name: 'Theme', exact: true }).click();
      await expect(page.getByText(/Preview from Collaboration: 4 tokens/)).toBeVisible();
      await expect(page.getByText(/\b0 custom\b|custom/)).toHaveCount(0);
      await page.getByRole('button', { name: /Preview from Collaboration/ }).click();
      await expect(page.getByText(/Preview from Collaboration/)).toHaveCount(0);
      await hidePane(page, 'Mood');
      await expect.poll(panel).toBe(before);
      await expect.poll(() => token('--border')).not.toContain('linear-gradient');
    } finally {
      await app.close();
    }
  });
});
