import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 16 · Sync — the pane's states: not synced, synced with
 * a time and size, changed here since. Recovery and drift are sync-* specs.
 */
test.describe('guide 16 · Sync', () => {
  test('SYNC-01 — not synced → synced with a time and size → changed here after the last push', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Backed up');
      const monaco = await writeFirstFile(page, 'index.html', '<h1>One</h1>');
      const sync = await openPanel(page, 'sync', 'Toggle sync');
      await connectAccount(page, sync);
      await expect(sync.getByText('Not synced yet')).toBeVisible({ timeout: 30_000 });
      await sync.getByRole('button', { name: 'Push to cloud' }).click();
      await expect(sync.getByText(/Synced .+/)).toBeVisible({ timeout: 60_000 });
      await expect(sync.getByText(/\d+(\.\d+)? (B|KB|MB)/).first()).toBeVisible();
      expect(Object.keys(api.state.sync.cruxes)).toHaveLength(1);
      // An edit after the push: Pull warns that this copy moved on.
      await monaco.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type('<h1>Two</h1>');
      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForTimeout(3000);
      await sync.getByRole('button', { name: 'Pull from cloud' }).click();
      const ask = page.getByRole('dialog', { name: 'Pull from cloud' });
      await expect(ask).toContainText(/changed here after its last push/);
      await ask.getByRole('button', { name: 'Cancel' }).click();
      // Pushing again keeps one record, newer.
      const before = api.state.sync.up;
      await sync.getByRole('button', { name: 'Push to cloud' }).click();
      await expect.poll(() => api.state.sync.up, { timeout: 60_000 }).toBeGreaterThan(before);
      expect(Object.keys(api.state.sync.cruxes)).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
