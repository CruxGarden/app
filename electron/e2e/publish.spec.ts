import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * Publish journey against a mocked api.crux.garden: connect an account from
 * the Share pane → first publish (create path) → edit → republish (update
 * path) → a failing publish shows WHY instead of silently doing nothing.
 */
test.describe('publish (mocked API)', () => {
  test.setTimeout(150_000);

  test('connect, publish, republish, and see a failure', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();

      // Something to publish
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>Hello</h1>');
      await page.keyboard.press('Meta+s');

      // Share pane → Share → not connected → inline connect form
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();

      // Connecting continues straight into the publish (create path)
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('v1', { exact: true })).toBeVisible();
      await expect(page.getByText(/crux\.garden\/tester\//)).toBeVisible();
      expect(api.log.some((l) => l.startsWith('POST /cruxes ->'))).toBe(true);
      expect(api.log.some((l) => l.startsWith(`POST /cruxes/${api.state.crux!.id as string}/publish`))).toBe(true);
      await page.screenshot({ path: 'e2e/.results/publish-1-published.png' });

      // Edit → unpublished changes → Update (update path)
      await monaco.click();
      await page.keyboard.press('Meta+ArrowDown');
      await page.keyboard.type('<p>More</p>');
      await page.keyboard.press('Meta+s');
      const update = page.getByRole('button', { name: 'Update', exact: true });
      await expect(update).toBeVisible();
      await update.click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('v2', { exact: true })).toBeVisible();
      expect(api.log.filter((l) => l.startsWith('PATCH /cruxes/'))).toHaveLength(1);

      // A failing publish must say why (used to be catch {} → nothing happened)
      api.state.failPublish = true;
      await monaco.click();
      await page.keyboard.press('Meta+ArrowDown');
      await page.keyboard.type('<p>Again</p>');
      await page.keyboard.press('Meta+s');
      await page.getByRole('button', { name: 'Update', exact: true }).click();
      const failure = page.getByRole('alert').filter({ hasText: /Simulated outage/ });
      await expect(failure).toHaveCount(1);
      await page.screenshot({ path: 'e2e/.results/publish-2-failure.png' });
      // Still publishable afterwards — the button is back, not stuck
      await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeVisible();
      // Only the intentional not-found probe may 404
      expect(api.log.filter((l) => l.includes('-> 404') && !l.startsWith('GET /cruxes/'))).toEqual([]);
    } finally {
      await app.close();
      await api.close();
    }
  });
});
