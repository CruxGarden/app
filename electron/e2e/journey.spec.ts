import { skipSetupToHome } from './setup-helpers';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Two regression guards on the Home Page template's Builder that no other
 * spec holds:
 *  - the workspace once rendered desktop AND mobile layouts (one CSS-hidden),
 *    so every pane — and the Keeper's greeting — was mounted twice;
 *  - every Cmd+S refetched the file and remounted Monaco (flicker, cursor
 *    reset, keystrokes typed during the save lost).
 *
 * The acceptance journey itself (create → version → publish) is
 * journeys/01-create-version-publish.spec.ts; the astro dev preview of a post
 * is homepage-collaboration.spec.ts and form.spec.ts.
 */
test.describe('home page template regressions', () => {
  test.setTimeout(3 * 60_000);

  test('Keeper greeting is mounted once; Monaco is not remounted on save', async () => {
    const { app, page } = await launchApp();
    try {
      // ── Gateway → fresh garden ─────────────────────────────────────────
      await skipSetupToHome(page);

      // ── Home → New Crux from the Astro Home Page template ──────────────
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Home Page/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'Edit content', exact: true }).click();

      // Builder is the Workshop's home view for content-model cruxes
      const newPost = page.getByRole('button', { name: /new post/i });
      await expect(newPost).toBeVisible({ timeout: 30_000 });
      // Regression: the greeting was mounted twice (desktop + hidden mobile layout).
      await expect(page.getByText(/set up your home page/)).toHaveCount(1);
      await page.screenshot({ path: 'e2e/.results/journey-1-builder.png' });

      // ── New post via the in-app dialog (window.prompt does not exist here) ─
      await newPost.click();
      await page.getByPlaceholder('Post title').fill('Hello from Playwright');
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      // ── Editing + saving must not remount Monaco ─────────────────────────
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.evaluate((el) => el.setAttribute('data-e2e-instance', 'original'));
      await monaco.click();
      await page.keyboard.press('ControlOrMeta+ArrowDown'); // end of document (mac)
      await page.keyboard.press('End');
      await page.keyboard.type(' Typed by Playwright.');
      await expect(monaco).toContainText('Typed by Playwright.'); // typing landed
      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForTimeout(800); // save round-trip
      await expect(page.locator('.monaco-editor[data-e2e-instance="original"]')).toBeVisible(); // same instance
      await expect(monaco).toContainText('Typed by Playwright.'); // text survived the save
    } finally {
      await app.close();
    }
  });
});
