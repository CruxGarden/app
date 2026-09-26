import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { openPanel, showPane } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 17 · Share — Discoverable: listing is separate from the
 * address. The publish/update/unshare rows are in publish.spec.ts and
 * journeys/01.
 */
test.describe('guide 17 · Share', () => {
  test('SHARE-05 — Discoverable off removes the Crux from Explore but not from its address', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Quiet page');
      await writeFirstFile(page, 'index.html', '<h1>Quiet</h1>');
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      const cruxId = Object.keys(api.state.cruxes)[0]!;
      const address = page.getByText(/\/tester\/[a-z0-9-]+$/);
      await expect(address).toBeVisible();

      // Shared is not listed: Discoverable starts off. Turning it on lists the Crux.
      const discoverable = share.getByRole('switch', { name: 'Discoverable' });
      await expect(discoverable).toHaveAttribute('aria-checked', 'false');
      await discoverable.click();
      await expect(discoverable).toHaveAttribute('aria-checked', 'true');
      await expect
        .poll(() => api.state.cruxes[cruxId]?.discoverable, { timeout: 30_000 })
        .toBe(true);
      const explore = await showPane(page, 'Explore');
      await explore.getByPlaceholder(/moods and authors/).fill('quiet');
      await expect(explore.getByRole('link', { name: 'Quiet page' })).toBeVisible({
        timeout: 30_000,
      });

      // Off: gone from the listing, the setting reached the API, the address is unchanged.
      await discoverable.click();
      await expect(discoverable).toHaveAttribute('aria-checked', 'false');
      await expect
        .poll(() => api.state.cruxes[cruxId]?.discoverable, { timeout: 30_000 })
        .toBe(false);
      await explore.getByPlaceholder(/moods and authors/).fill('quiet ');
      await explore.getByPlaceholder(/moods and authors/).fill('quiet');
      await expect(explore.getByRole('link', { name: 'Quiet page' })).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect(address).toBeVisible();
      await expect(page.getByText('Up to date')).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('SHARE-02/08 — declining the first-share question shares nothing; Unshare asks, cancel keeps it live, confirm takes it down', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Second thoughts');
      await writeFirstFile(page, 'index.html', '<h1>Maybe</h1>');
      const share = await openPanel(page, 'publish', 'Toggle share');
      await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
      await connectAccount(page);
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      // Decline: nothing goes out.
      await page.keyboard.press('Escape');
      await expect(ask).toHaveCount(0);
      await page.waitForTimeout(1500);
      expect(Object.keys(api.state.published)).toHaveLength(0);
      await expect(share.getByText('Up to date')).toHaveCount(0);
      // Now share for real.
      await share.getByRole('button', { name: 'Share', exact: true }).click();
      const again = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(again).toBeVisible({ timeout: 30_000 });
      await again.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(share.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      const cruxId = Object.keys(api.state.published)[0]!;
      // Unshare: cancel keeps it live.
      await share.getByRole('button', { name: 'Unshare', exact: true }).click();
      const unshare = page.getByRole('dialog', { name: 'Unshare this crux' });
      await expect(unshare).toContainText(/[a-z]/);
      await unshare.getByRole('button', { name: 'Cancel' }).click();
      await expect(share.getByText('Up to date')).toBeVisible();
      expect(api.state.published[cruxId]).toBeTruthy();
      // Confirm: offline, and the pane says so.
      await share.getByRole('button', { name: 'Unshare', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Unshare this crux' })
        .getByRole('button', { name: 'Unshare', exact: true })
        .click();
      await expect(share.getByText('Up to date')).toHaveCount(0, { timeout: 30_000 });
      await expect(share.getByRole('button', { name: 'Share', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect.poll(() => api.state.published[cruxId] ?? null).toBeNull();
    } finally {
      await app.close();
    }
  });
});
