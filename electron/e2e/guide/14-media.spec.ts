import { test, expect } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux, storedCrux } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 14 · Find media — a found image travels inside the
 * Crux's archive and is there offline. Search and use are in find-media.spec.
 */
test.describe('guide 14 · Find media', () => {
  test('MEDIA-05 — an exported Crux carries its found media; imported offline, the file is there', async () => {
    test.setTimeout(180_000);
    const api = await startMockApi();
    const first = await launchApp({ env: { CRUX_API_URL: api.url, CRUX_MEDIA_API: api.url } });
    const filename = join(first.dir, 'with-media.crux');
    try {
      const { app, page } = first;
      await enterGarden(page);
      const id = await createCrux(page, 'Seedlings page');
      const media = await openPanel(page, 'media', 'Toggle find media');
      await media.getByLabel('Search media').fill('seedlings');
      await media.getByRole('button', { name: 'Search', exact: true }).click();
      const results = media.getByRole('list', { name: 'Media results' });
      await expect(results.getByRole('listitem').first()).toBeVisible({ timeout: 30_000 });
      await results.getByRole('button', { name: /^Use / }).first().click();
      const folder = (await storedCrux(page, id)).projectFolder as string;
      await expect.poll(() => existsSync(join(folder, 'images')), { timeout: 30_000 }).toBe(true);
      // Export it whole.
      const exportPane = await openPanel(page, 'export', 'Toggle export');
      await app.evaluate(({ session }, filename) => {
        session.defaultSession.once('will-download', (_event: Event, item: DownloadItem) =>
          item.setSavePath(filename),
        );
      }, filename);
      await exportPane.getByRole('button', { name: 'Export Crux', exact: true }).click();
      await expect.poll(() => existsSync(filename), { timeout: 60_000 }).toBe(true);
    } finally {
      await first.app.close();
    }
    // A second installation with no media catalogue at all.
    await api.close();
    const second = await launchApp();
    try {
      const { page } = second;
      await enterGarden(page);
      await page.getByRole('button', { name: 'Add Crux' }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import .crux file', exact: true }).click();
      await (await chooser).setFiles(filename);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 90_000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const folder = (await storedCrux(page, id)).projectFolder as string;
      await expect.poll(() => existsSync(join(folder, 'images')), { timeout: 60_000 }).toBe(true);
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await expect(page.getByRole('tree').getByText('images', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await second.app.close();
    }
  });
});
