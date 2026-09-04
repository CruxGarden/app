import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * The `iconSet` theme token reaches the glyphs: applying a Mood that picks the
 * pixel set stamps `<html data-icon-set="pixel">` and every icon in the icon
 * module re-renders its pixel path (ADR 0014).
 */
test.describe('icon set', () => {
  test('Windows 95 draws pixel icons in the TopBar; the default is line', async () => {
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('region', { name: 'Mood Bar' })).toBeVisible({
        timeout: 30_000,
      });

      const html = page.locator('html');
      const explore = page.getByRole('button', { name: 'Explore' }).locator('svg');
      await expect(html).toHaveAttribute('data-icon-set', 'line');
      await expect(explore).toHaveAttribute('data-set', 'line');
      await expect(explore).toHaveAttribute('data-icon', 'search');

      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      const built = page.getByTestId('bundled-moods');
      await built.getByTestId('bundled-windows-95').getByRole('button', { name: 'Apply' }).click();

      await expect(page.locator('html[data-icon-set="pixel"]')).toHaveCount(1);
      await expect(explore).toHaveAttribute('data-set', 'pixel');
      await expect(explore).toHaveAttribute('viewBox', '0 0 16 16');
      await expect(explore).toHaveAttribute('shape-rendering', 'crispEdges');
      // every glyph on the page moved together
      expect(await page.locator('svg[data-icon]:not([data-set="pixel"])').count()).toBe(0);

      // A filled Mood flips the whole surface again
      await built
        .getByTestId('bundled-pretty-in-pink')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect(page.locator('html[data-icon-set="filled"]')).toHaveCount(1);
      await expect(explore).toHaveAttribute('data-set', 'filled');
      await page.keyboard.press('Escape');
      await page.screenshot({ path: 'e2e/.results/icon-set-filled.png' });
    } finally {
      await app.close();
    }
  });
});
