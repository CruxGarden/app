import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The map tool (the actual MapLibre GL and Terra Draw, plus one page) as a
 * Crux Tool: a place clicked onto the map and titled by a person reaches
 * data/project.json as GeoJSON, the scripted collaborator names the map, adds
 * places, fits the view and saves the picture, a person saves their own
 * picture from the bar, Share selected content publishes the read-only map,
 * the map survives a restart, and a complete Crux archive imports into a
 * clean Garden with the folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 180000 });
  await expect(frameOf(page).locator('.maplibregl-canvas')).toBeVisible();
}

test('Map: a clicked place, agent places with a picture, publish, restart and clean import', async () => {
  test.setTimeout(12 * 60_000);
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1', CRUX_API_URL: api.url } });
  const evidence = resolve(__dirname, '../../docs/maps');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'map.crux');
  let folder = '';
  let id = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const features = () =>
    (doc().project?.features ?? []) as {
      id: string;
      geometry: { type: string };
      properties: { title?: string; notes?: string };
    }[];
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the map opens and the empty map saves', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Map\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('Map folder', folder);
      await ready(page);
      await expect.poll(() => doc().project?.style ?? '').toBe('liberty');
      expect(features()).toEqual([]);
      await page.screenshot({ path: join(evidence, 'maps-initial.png') });
    });

    await test.step('a person names the map, clicks a place onto it and titles it; the GeoJSON is saved', async () => {
      await frameOf(page).locator('#map-name').fill('Walk');
      await frameOf(page).getByRole('button', { name: 'Add place', exact: true }).click();
      const canvas = frameOf(page).locator('.maplibregl-canvas');
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(frameOf(page).locator('#place-list li')).toHaveCount(1);
      await frameOf(page).getByRole('button', { name: 'Select', exact: true }).click();
      await frameOf(page).locator('#place-list li').first().click();
      await expect(frameOf(page).locator('#place-editor')).toBeVisible();
      await frameOf(page).locator('#place-title').fill('Meeting point');
      await expect(frameOf(page).locator('#place-list li').first()).toHaveText('Meeting point');
      await ready(page);
      await expect.poll(() => features().length, { timeout: 30000 }).toBe(1);
      expect(features()[0]).toMatchObject({
        geometry: { type: 'Point' },
        properties: { title: 'Meeting point' },
      });
      expect(doc().project.name).toBe('Walk');
      await page.screenshot({ path: join(evidence, 'maps-place.png') });
    });

    await test.step('the scripted collaborator names the map, adds two places, fits the view and saves the picture', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Plan the seed swap walk [map:places]');
      await box.press('Enter');
      await expect(
        page.getByText(
          'Named the map, added the seed library and the community garden, fitted the view and saved the picture.',
          { exact: true },
        ),
      ).toBeVisible({ timeout: 240000 });
      await ready(page);
      expect(doc().project.name).toBe('Seed swap walk');
      expect(features().map((f) => f.properties.title)).toEqual([
        'Meeting point',
        'Seed library',
        'Community garden',
      ]);
      await expect(frameOf(page).locator('#place-list li')).toHaveCount(3);
      const outs = outputs(folder);
      expect(outs.map((o) => o.label)).toEqual(['Seed swap walk']);
      expect(outs[0]!.mimeType).toBe('image/png');
      expect(readFileSync(join(folder, outs[0]!.path)).subarray(1, 4).toString()).toBe('PNG');
      await collab.click();
      await page.screenshot({ path: join(evidence, 'maps-agent.png') });
    });

    await test.step('a person saves their own picture from the bar', async () => {
      await frameOf(page).locator('#output-name').fill('Walk map');
      await frameOf(page).locator('#save-image').click();
      await expect(status(page)).toContainText('Saved Walk map as an image output', {
        timeout: 60000,
      });
      await expect.poll(() => outputs(folder).length).toBe(2);
    });

    await test.step('Share selected content publishes the read-only map; served from the Crux it lists the places', async () => {
      await page
        .getByTestId('workshop-view')
        .getByRole('button', { name: 'Share selected content', exact: true })
        .click();
      const share = page.getByTestId('pane-body-publish');
      await share.getByRole('button', { name: 'Share selected content', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code', exact: true }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 60000 });
      await backupAsk.getByRole('button', { name: 'Share without a backup', exact: true }).click();
      await expect(share.getByText(/^(Up to date|Changes to share)$/)).toBeVisible({
        timeout: 8 * 60_000,
      });
      const published = api.state.published[id] ?? [];
      const paths = published.map((f) => f.path);
      expect(paths).toContain('index.html');
      expect(paths.some((p) => /^(data|src|garden)\//.test(p) || p === 'edition.html')).toBe(false);
      const html = published.find((f) => f.path === 'index.html')!.bytes.toString('utf8');
      expect(html).toContain('window.__MAP__');
      expect(html).toContain('Seed swap walk');
      const previewOrigin = new URL(
        (await page.locator('iframe[data-crux-id]').getAttribute('src'))!,
      ).origin;
      await page.locator('iframe[data-crux-id]').evaluate((el: HTMLIFrameElement, url) => {
        el.src = url;
      }, `${previewOrigin}/dist/index.html`);
      const served = frameOf(page);
      await expect(served.getByRole('heading', { name: 'Seed swap walk', level: 1 })).toBeVisible();
      await expect(served.locator('#place-list li')).toHaveCount(3);
      await expect(served.locator('#place-list li').nth(1)).toContainText(
        'Seed library — Start here at 10',
      );
      await expect(served.locator('.maplibregl-canvas')).toBeVisible({ timeout: 60000 });
      await page.screenshot({ path: join(evidence, 'maps-published.png') });
      await page.getByRole('button', { name: 'Toggle share' }).click();
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir, env: { CRUX_API_URL: api.url } });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole('button', { name: /enter/i }).click();
    await test.step('restart: the map comes back with its places and outputs', async () => {
      await ready(page);
      await expect(frameOf(page).locator('#map-name')).toHaveValue('Seed swap walk');
      await expect(frameOf(page).locator('#place-list li')).toHaveCount(3);
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'maps-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports and a place is removed', async () => {
      await importNativeCrux(page, archive);
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      await expect(frameOf(page).locator('#place-list li')).toHaveCount(3);
      await frameOf(page).locator('#place-list li').first().click();
      await frameOf(page).getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(frameOf(page).locator('#place-list li')).toHaveCount(2);
      await ready(page);
      await expect.poll(() => features().length).toBe(2);
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'maps-imported.png') });
    });
  } finally {
    await third.app.close();
    await api.close();
  }
});
