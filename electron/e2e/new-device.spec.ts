import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * The new-device flow (V1-CHECKLIST §5): device A connects, makes a crux and
 * pushes the garden; device B (a fresh install) chooses "Log in and restore
 * from crux.garden", connects, pulls — and the crux is there.
 */
test.describe('sync: new-device restore (mocked API)', () => {
  test.setTimeout(4 * 60_000);

  test('push on device A → restore on device B', async () => {
    const api = await startMockApi();

    // ── Device A ──
    const a = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
    try {
      const page = a.page;
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByPlaceholder('My Crux').fill('Carried Over');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByText('Carried Over').first()).toBeVisible({ timeout: 30_000 });

      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(page.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: /^Sync/ }).click();
      await page.getByRole('button', { name: 'Push garden' }).click();
      await expect(page.getByText(/Last pushed:/)).toBeVisible({ timeout: 60_000 });
      expect(api.state.sync.garden?.bytes ?? 0).toBeGreaterThan(0);
    } finally {
      await a.app.close();
    }

    // ── Device B: fresh userData + garden root ──
    const b = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1' } });
    try {
      const page = b.page;
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Log in and restore from crux.garden').click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await page.getByRole('button', { name: 'Restore garden' }).click({ timeout: 30_000 });
      // Redirects to Home with the garden restored
      await expect(page.getByText('Carried Over').first()).toBeVisible({ timeout: 90_000 });
      expect(api.state.sync.down).toBeGreaterThan(0);
      await page.screenshot({ path: 'e2e/.results/new-device-1-restored.png' });
      // The restored crux opens as a workspace
      await page.getByText('Carried Over').first().click();
      await expect(page.locator('.mosaic-window').first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await b.app.close();
      await api.close();
    }
  });
});
