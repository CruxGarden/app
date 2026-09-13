import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';

/**
 * Find media (V1-GAPS-PLAN.md §2.7): the Find media pane searches Openverse
 * (images, sounds) and Wikimedia Commons (video) and brings a result into the
 * open Crux with its license and author kept beside the file. The mock API
 * stands in for both catalogues (CRUX_MEDIA_API) so the journey runs offline.
 */
const origins = (folder: string) => {
  const dir = join(folder, 'media-origins');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map(
    (f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, unknown>,
  );
};

test('Find media: an image, a sound and a video from the catalogues land in the Crux with their origins', async () => {
  test.setTimeout(300000);
  const api = await startMockApi();
  const { app, page } = await launchApp({
    env: { CRUX_API_URL: api.url, CRUX_MEDIA_API: api.url },
  });
  const evidence = resolve(__dirname, '../../docs/find-media');
  try {
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^miniPaint/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder as string;

    await test.step('open Find media and bring an image in', async () => {
      await page.getByRole('button', { name: 'Toggle find media', exact: true }).click();
      const pane = page.getByTestId('pane-body-media');
      await expect(pane).toBeVisible();
      await pane.getByLabel('Search media').fill('seedlings');
      await pane.getByRole('button', { name: 'Search', exact: true }).click();
      const results = pane.getByRole('list', { name: 'Media results' });
      await expect(results.getByRole('listitem')).toHaveCount(2);
      await expect(results.getByRole('listitem').first()).toContainText('Ana Grower · BY 4.0');
      await results.getByRole('button', { name: 'Use Seedlings for seedlings' }).click();
      await expect(pane.getByRole('status')).toContainText(
        'Added images/seedlings-for-seedlings-img-1.png',
        { timeout: 60000 },
      );
      await expect
        .poll(() => existsSync(join(folder, 'images/seedlings-for-seedlings-img-1.png')))
        .toBe(true);
      expect(
        readFileSync(join(folder, 'images/seedlings-for-seedlings-img-1.png'))
          .subarray(1, 4)
          .toString(),
      ).toBe('PNG');
      await expect.poll(() => origins(folder).length).toBe(1);
      expect(origins(folder)[0]).toMatchObject({
        provider: 'openverse',
        kind: 'image',
        license: 'BY',
        creator: 'Ana Grower',
        path: 'images/seedlings-for-seedlings-img-1.png',
      });
      await page.screenshot({ path: join(evidence, 'find-media-images.png') });
    });

    await test.step('a sound into its own folder, a video into media/', async () => {
      const pane = page.getByTestId('pane-body-media');
      await pane.getByRole('tab', { name: 'Sounds' }).click();
      await pane.getByLabel('Search media').fill('bell');
      await pane.getByRole('button', { name: 'Search', exact: true }).click();
      await pane.getByRole('button', { name: 'Use Chime for bell' }).click();
      await expect(pane.getByRole('status')).toContainText('Added audio/chime-for-bell-aud-1.wav', {
        timeout: 60000,
      });
      expect(
        readFileSync(join(folder, 'audio/chime-for-bell-aud-1.wav')).subarray(0, 4).toString(),
      ).toBe('RIFF');
      await pane.getByRole('tab', { name: 'Video' }).click();
      await pane.getByLabel('Search media').fill('bees');
      await pane.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(
        pane.getByRole('list', { name: 'Media results' }).getByRole('listitem').first(),
      ).toContainText('Dee · CC BY-SA 4.0');
      await pane.getByRole('button', { name: 'Use Bees at work' }).click();
      await expect(pane.getByRole('status')).toContainText('Added media/bees-at-work-900.webm', {
        timeout: 60000,
      });
      await expect.poll(() => origins(folder).length).toBe(3);
      expect(
        origins(folder)
          .map((o) => o.provider)
          .sort(),
      ).toEqual(['openverse', 'openverse', 'wikimedia-commons']);
      await page.screenshot({ path: join(evidence, 'find-media-video.png') });
    });

    await test.step('the files and their origins are Artifacts of the Crux', async () => {
      const paths = (await page.evaluate(
        async (cruxId) =>
          window.electronAPI!.sqlite.all(
            "SELECT path FROM artifacts WHERE resource_id = ? AND (path LIKE 'images/%' OR path LIKE 'audio/%' OR path LIKE 'media/%' OR path LIKE 'media-origins/%') ORDER BY path",
            [cruxId],
          ),
        id,
      )) as { path: string }[];
      expect(paths.map((p) => p.path)).toEqual(
        expect.arrayContaining([
          'images/seedlings-for-seedlings-img-1.png',
          'audio/chime-for-bell-aud-1.wav',
          'media/bees-at-work-900.webm',
        ]),
      );
      expect(paths.filter((p) => p.path.startsWith('media-origins/')).length).toBe(3);
    });
  } finally {
    await app.close();
    await api.close();
  }
});
