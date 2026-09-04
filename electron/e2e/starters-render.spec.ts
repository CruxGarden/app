import { test, expect, chromium } from '@playwright/test';
import { launchApp } from './launch';

/**
 * The Feed and Media starters actually build: open an item so astro dev
 * starts, then assert on the served site itself. Opt-in (pnpm install + two
 * dev servers): CRUX_SLOW=1 npx playwright test e2e/starters-render.spec.ts
 */
test.describe('starter templates render through astro dev', () => {
  test.skip(!process.env.CRUX_SLOW, 'set CRUX_SLOW=1 (network: pnpm install)');
  test.setTimeout(10 * 60_000);

  test('Feed grid and post; Media list with the pending player', async () => {
    const { app, page } = await launchApp();
    const browser = await chromium.launch();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      // ── Feed ──
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Feed/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: /new post/i }).first()).toBeVisible({
        timeout: 30_000,
      });
      // Open a sample post → editor + astro dev preview
      await page.getByText('Morning light').first().click();
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      await expect(preview).toBeVisible({ timeout: 5 * 60_000 });
      const feedUrl = new URL('/', (await preview.getAttribute('src'))!).toString();
      const site = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      await site.goto(feedUrl);
      await expect(site.locator('.profile h1')).toHaveText('Your Name');
      await expect(site.locator('.grid .tile')).toHaveCount(2);
      await site.locator('.grid .tile').first().click();
      await expect(site.locator('.post h1')).toBeVisible();
      await expect(site.locator('.post img')).toBeVisible();
      await site.screenshot({ path: 'e2e/.results/starters-render-1-feed.png', fullPage: true });
      await site.close();

      // ── Media ──
      await page.goto(page.url().replace(/\/c\/.*$/, '/home'));
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Media/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add media' }).first()).toBeVisible({
        timeout: 30_000,
      });
      await page.getByText('Your first track goes here').first().click();
      const preview2 = page.locator('iframe[src^="http://127.0.0.1"]');
      await expect(preview2).toBeVisible({ timeout: 5 * 60_000 });
      const mediaUrl = new URL('/', (await preview2.getAttribute('src'))!).toString();
      const site2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      await site2.goto(mediaUrl);
      await expect(site2.locator('header.site h1')).toHaveText('Your Name');
      await expect(site2.locator('.items .item')).toHaveCount(1);
      await expect(site2.locator('.pending')).toContainText('No file yet');
      await site2.screenshot({ path: 'e2e/.results/starters-render-2-media.png', fullPage: true });
      await site2.close();
    } finally {
      await browser.close();
      await app.close();
    }
  });
});
