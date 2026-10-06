import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  test('MEDIA-01 — results follow the query and the category; a query with nothing says so; a category change clears the list', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({
      env: { CRUX_API_URL: api.url, CRUX_MEDIA_API: api.url },
    });
    try {
      await enterGarden(page);
      await createCrux(page, 'Media search');
      const media = await openPanel(page, 'media', 'Toggle find media');
      const results = media.getByRole('list', { name: 'Media results' });
      const search = async (q: string) => {
        await media.getByLabel('Search media').fill(q);
        await media.getByRole('button', { name: 'Search', exact: true }).click();
      };
      // Nothing typed: the button waits, the pane explains where results come from.
      await expect(media.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
      await expect(media.getByText(/Openly licensed work from Openverse/)).toBeVisible();
      // Images: two results, each with its author and license.
      await search('seedlings');
      await expect(results.getByRole('listitem')).toHaveCount(2, { timeout: 30_000 });
      await expect(results.getByRole('listitem').nth(0)).toContainText('Seedlings for seedlings');
      await expect(results.getByRole('listitem').nth(0)).toContainText('Ana Grower · BY 4.0');
      await expect(results.getByRole('listitem').nth(1)).toContainText(/Bo · CC0/i);
      await expect(results.getByRole('link', { name: /Source/ }).first()).toHaveAttribute(
        'href',
        'https://example.org/seedlings',
      );
      // A changed query changes the results.
      await search('ferns');
      await expect(results.getByRole('listitem').first()).toContainText('Seedlings for ferns', {
        timeout: 30_000,
      });
      await expect(results).not.toContainText('Seedlings for seedlings');
      // A query the catalogue has nothing for: an empty state in words, not a blank pane.
      await search('nothing');
      await expect(media.getByText('Nothing found. Try other words.')).toBeVisible({
        timeout: 30_000,
      });
      await expect(results).toHaveCount(0);
      // Sounds: switching the category clears the last list until a new search.
      await media.getByRole('tab', { name: 'Sounds' }).click();
      await expect(media.getByRole('tab', { name: 'Sounds' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(media.getByLabel('Search media')).toHaveAttribute(
        'placeholder',
        'Search sounds…',
      );
      await expect(media.getByText(/Openly licensed work from Openverse/)).toBeVisible();
      await search('bell');
      await expect(results.getByRole('listitem')).toHaveCount(1, { timeout: 30_000 });
      await expect(results.getByRole('listitem').first()).toContainText('Chime for bell');
      await expect(results.getByRole('listitem').first()).toContainText('Cy Bell · BY-SA 4.0');
      // Video: Wikimedia Commons, its author and license, and the picture size.
      await media.getByRole('tab', { name: 'Video' }).click();
      await search('bees');
      await expect(results.getByRole('listitem')).toHaveCount(1, { timeout: 30_000 });
      await expect(results.getByRole('listitem').first()).toContainText('Bees at work');
      await expect(results.getByRole('listitem').first()).toContainText('Dee · CC BY-SA 4.0');
      await expect(results.getByRole('listitem').first()).toContainText('320×240');
      // The pane has no page controls: one page of results per search.
      await expect(media.getByRole('button', { name: /next|more|page/i })).toHaveCount(0);
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('MEDIA-02 — a sound and a video preview in place before Use; Stop ends it; a category change stops it; nothing is added', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({
      env: { CRUX_API_URL: api.url, CRUX_MEDIA_API: api.url },
    });
    try {
      await enterGarden(page);
      const id = await createCrux(page, 'Media preview');
      const folder = (await storedCrux(page, id)).projectFolder as string;
      const media = await openPanel(page, 'media', 'Toggle find media');
      const results = media.getByRole('list', { name: 'Media results' });
      const search = async (q: string) => {
        await media.getByLabel('Search media').fill(q);
        await media.getByRole('button', { name: 'Search', exact: true }).click();
      };
      // A sound: Preview plays it in the row with its own controls.
      await media.getByRole('tab', { name: 'Sounds' }).click();
      await search('bell');
      const row = results.getByRole('listitem').first();
      await expect(row).toContainText('Chime for bell', { timeout: 30_000 });
      const previewButton = row.getByRole('button', { name: 'Preview Chime for bell' });
      await previewButton.click();
      const preview = row.getByTestId('media-preview');
      await expect(preview.locator('audio')).toHaveCount(1, { timeout: 30_000 });
      await expect(preview.locator('audio')).toHaveAttribute('controls', '');
      await expect(row.getByRole('button', { name: 'Stop preview' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      // Stop takes it away and revokes it.
      await row.getByRole('button', { name: 'Stop preview' }).click();
      await expect(preview).toHaveCount(0);
      await expect(previewButton).toHaveAttribute('aria-pressed', 'false');
      // A video previews too; switching the category stops it.
      await media.getByRole('tab', { name: 'Video' }).click();
      await search('bees');
      const video = results.getByRole('listitem').first();
      await expect(video).toContainText('Bees at work', { timeout: 30_000 });
      await video.getByRole('button', { name: /^Preview Bees at work/ }).click();
      await expect(video.getByTestId('media-preview').locator('video')).toHaveCount(1, {
        timeout: 30_000,
      });
      await media.getByRole('tab', { name: 'Images' }).click();
      await expect(media.getByTestId('media-preview')).toHaveCount(0);
      // Previewing added nothing to the Crux.
      for (const dir of ['audio', 'media', 'images', 'media-origins']) {
        expect(existsSync(join(folder, dir))).toBe(false);
      }
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('MEDIA-04 — a failed download is explained and leaves no file; the same result lands in a second Crux under its own folder', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({
      env: { CRUX_API_URL: api.url, CRUX_MEDIA_API: api.url },
    });
    try {
      await enterGarden(page);
      const first = await createCrux(page, 'First album');
      const firstFolder = (await storedCrux(page, first)).projectFolder as string;
      const media = await openPanel(page, 'media', 'Toggle find media');
      const results = media.getByRole('list', { name: 'Media results' });
      const search = async (q: string) => {
        await media.getByLabel('Search media').fill(q);
        await media.getByRole('button', { name: 'Search', exact: true }).click();
        await expect(results.getByRole('listitem').first()).toBeVisible({ timeout: 30_000 });
      };
      const use = () => results.getByRole('button', { name: 'Use Seedlings for seedlings' });
      const file = 'images/seedlings-for-seedlings-img-1.png';

      // The host of the file is down: the pane says so, and nothing pretends to have arrived.
      api.state.failMediaFile = true;
      await search('seedlings');
      await use().click();
      await expect(media.getByRole('alert')).toContainText('The file could not be fetched (503).', {
        timeout: 30_000,
      });
      await expect(media.getByRole('status')).toHaveCount(0);
      expect(existsSync(join(firstFolder, file))).toBe(false);
      expect(existsSync(join(firstFolder, 'media-origins'))).toBe(false);
      expect(existsSync(join(firstFolder, 'images'))).toBe(false);
      // While a file is on its way the other Use buttons wait; there is no cancel control.
      await expect(media.getByRole('button', { name: /^Cancel/ })).toHaveCount(0);

      // The host is back: the same result now lands in this Crux.
      api.state.failMediaFile = false;
      await use().click();
      await expect(media.getByRole('status')).toContainText(`Added ${file}`, { timeout: 60_000 });
      await expect(media.getByRole('alert')).toHaveCount(0);
      await expect.poll(() => existsSync(join(firstFolder, file)), { timeout: 30_000 }).toBe(true);
      expect(readFileSync(join(firstFolder, file)).subarray(1, 4).toString()).toBe('PNG');

      // A second Crux takes the same result under the same filename, in its own folder.
      const second = await createCrux(page, 'Second album');
      const secondFolder = (await storedCrux(page, second)).projectFolder as string;
      expect(secondFolder).not.toBe(firstFolder);
      const media2 = await openPanel(page, 'media', 'Toggle find media');
      await media2.getByLabel('Search media').fill('seedlings');
      await media2.getByRole('button', { name: 'Search', exact: true }).click();
      await media2
        .getByRole('list', { name: 'Media results' })
        .getByRole('button', { name: 'Use Seedlings for seedlings' })
        .click();
      await expect(media2.getByRole('status')).toContainText(`Added ${file}`, { timeout: 60_000 });
      await expect.poll(() => existsSync(join(secondFolder, file)), { timeout: 30_000 }).toBe(true);
      expect(readFileSync(join(secondFolder, file)).subarray(1, 4).toString()).toBe('PNG');
      // Each Crux holds only its own copy: one image and one origin apiece, and the
      // second Crux's Artifacts show the folder as its own.
      for (const folder of [firstFolder, secondFolder]) {
        expect(readdirSync(join(folder, 'images'))).toEqual(['seedlings-for-seedlings-img-1.png']);
        expect(readdirSync(join(folder, 'media-origins'))).toHaveLength(1);
      }
      await openPanel(page, 'artifacts', 'Toggle artifacts');
      await expect(page.getByRole('tree').getByText('images', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      void first;
    } finally {
      await app.close();
      await api.close();
    }
  });

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
      await page.getByRole('button', { name: 'Import Crux, tool or Mood', exact: true }).click();
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
