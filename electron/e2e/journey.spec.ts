import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * The v1 acceptance journey, local half (V1-CHECKLIST §8) — everything up to
 * the network steps (publish, sync), which need an account and stay manual:
 *
 *   fresh install → plant a garden → New Crux from the Home Page template
 *   → Builder → New post → editor + live astro dev preview → snapshot.
 *
 * First run pays for `pnpm install` (network); later runs hit the pnpm store.
 */
test.describe('acceptance journey (local half)', () => {
  test.setTimeout(6 * 60_000);

  test('plant → template → post → preview → snapshot', async () => {
    const { app, page } = await launchApp();
    try {
      // ── Gateway → fresh garden ─────────────────────────────────────────
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await expect(page.getByText('Set up your garden')).toBeVisible();
      await page.getByRole('button', { name: 'Welcome' }).click();

      // ── Home → New Crux from the Astro Home Page template ──────────────
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Home Page/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      // Builder is the Workshop's home view for content-model cruxes
      const newPost = page.getByRole('button', { name: /new post/i });
      await expect(newPost).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'e2e/.results/journey-1-builder.png' });

      // ── New post via the in-app dialog (window.prompt does not exist here) ─
      await newPost.click();
      await page.getByPlaceholder('Post title').fill('Hello from Playwright');
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      // Opening the .md in the editor starts astro dev; first run installs deps.
      const preview = page.locator('iframe[src^="http://127.0.0.1"]');
      await expect(preview).toBeVisible({ timeout: 4 * 60_000 });
      await expect(preview).toHaveAttribute('src', /\/posts\/hello-from-playwright$/);
      await page.screenshot({ path: 'e2e/.results/journey-2-preview.png' });

      // ── Snapshot with a label ─────────────────────────────────────────
      await page.getByRole('button', { name: 'Toggle history' }).click();
      await page.getByRole('button', { name: /snapshot/i }).first().click();
      const label = page.getByPlaceholder(/label/i);
      await label.fill('First post');
      await label.press('Enter');
      await expect(page.getByText('First post', { exact: true })).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'e2e/.results/journey-3-snapshot.png' });
    } finally {
      await app.close();
    }
  });
});
