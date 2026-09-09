import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * RESILIENCE-PLAN §3 scenarios 4 and 5: what this machine believes and what the
 * account holds can differ. The Share pane asks the API and says so; the Sync
 * pane notices a cloud copy this machine did not push.
 */
test.describe('drift between this machine and the account (mocked API)', () => {
  test.setTimeout(180_000);

  test('published elsewhere → noted; taken offline elsewhere → "No longer published" and Share again; a foreign cloud copy → noted in Sync', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>Drift</h1>');
      await page.keyboard.press('ControlOrMeta+s');

      // Share without a backup
      const toggleShare = page.getByRole('button', { name: 'Toggle share' });
      await toggleShare.click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
      await expect(ask).toBeVisible({ timeout: 30_000 });
      await ask.getByRole('checkbox').check(); // never ask again in this garden
      await ask.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      const id = Object.keys(api.state.published)[0]!;
      await expect(page.getByTestId('publish-drift')).toHaveCount(0);

      // Scenario 5: another machine published v9 of this crux
      (api.state.cruxes[id]!.meta as Record<string, unknown>).publishedVersion = 9;
      await toggleShare.click();
      await toggleShare.click(); // remount → the pane asks the API again
      await expect(page.getByTestId('publish-drift')).toContainText('Published elsewhere as v9', {
        timeout: 15_000,
      });

      // Scenario 4: taken offline elsewhere
      delete api.state.cruxes[id];
      delete api.state.published[id];
      if (api.state.crux?.id === id) api.state.crux = null; // the mock's "latest crux" shortcut too
      await toggleShare.click();
      await toggleShare.click();
      await expect(page.getByTestId('publish-drift')).toContainText('No longer published', {
        timeout: 15_000,
      });
      // Share again puts it back (the create path, since the record is gone)
      await page.getByRole('button', { name: 'Share again', exact: true }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('publish-drift')).toHaveCount(0);
      expect(api.state.published[id]).toBeTruthy();

      // "Always back up" was ticked: the share-again also pushed a backup — wait for it,
      // then pretend another machine pushed a newer copy afterwards
      await expect
        .poll(() => api.log.filter((l) => l.startsWith('PUT /sync/crux/')).length, {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);
      api.state.sync.cruxes[id] = {
        ...api.state.sync.cruxes[id]!,
        updatedAt: new Date(Date.now() + 60_000).toISOString(),
      };
      await page.getByRole('button', { name: 'Toggle sync' }).click();
      await expect(page.getByTestId('sync-drift')).toContainText('pushed from another machine', {
        timeout: 15_000,
      });
    } finally {
      await app.close();
    }
  });
});
