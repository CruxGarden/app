import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';
import { outputs } from './game-cruxspace-helpers';

/**
 * The Fantasy Map tool (the actual Fantasy Map Generator) as a Crux Tool: a new
 * world generates and its .map save lands in Garden; a person saves an SVG
 * render from the bar; the scripted collaborator names the world and saves a
 * PNG; the same world (seed and name) comes back after a restart; a complete
 * Crux archive imports into a clean Garden with the folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
const ready = (page: Page) =>
  expect(status(page)).toHaveText('Saved to Garden', { timeout: 180000 });

test('Fantasy Map: a world generates and saves, a person renders an SVG, the collaborator names it and renders a PNG, restart and clean import', async () => {
  test.setTimeout(15 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/fmg');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'world.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  let seed = '';
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().includes('[garden]'))
        console.log(`[renderer ${message.type()}] ${message.text().slice(0, 500)}`);
    });
    page.on('pageerror', (e) => console.log(`[pageerror] ${e.message.slice(0, 500)}`));
    await page.setViewportSize({ width: 1700, height: 1050 });
    await enterGarden(page);

    await test.step('create from the picker; a world generates and the save lands in Garden', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Fantasy Map\b/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      await expect
        .poll(() => doc().project?.map?.__cruxBinary?.size ?? 0, { timeout: 60000 })
        .toBeGreaterThan(10000);
      expect(existsSync(join(folder, 'data', doc().project.map.__cruxBinary.path))).toBe(true);
      seed = doc().project.seed;
      expect(seed).toMatch(/^\d+$/);
      await expect(frameOf(page).locator('#map')).toBeVisible();
      await page.screenshot({ path: join(evidence, 'fmg-initial.png') });
    });

    await test.step('a person saves an SVG render from the bar', async () => {
      const frame = frameOf(page);
      await frame.locator('#image-format').selectOption('svg');
      await frame.locator('#output-name').fill('The world, vector');
      await frame.locator('#save-image').click();
      await expect(status(page)).toContainText('Saved The world, vector as an image output', {
        timeout: 180000,
      });
      await expect.poll(() => outputs(folder).length).toBe(1);
      const [svg] = outputs(folder);
      expect(svg!.mimeType).toBe('image/svg+xml');
      expect(readFileSync(join(folder, svg!.path), 'utf8')).toContain('<svg');
      await page.screenshot({ path: join(evidence, 'fmg-svg.png') });
    });

    await test.step('the scripted collaborator names the world and renders a PNG', async () => {
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Name this world [map:world]');
      await box.press('Enter');
      await expect(
        page.getByText('Named the world Moss Isles and saved a PNG of it.', { exact: true }),
      ).toBeVisible({
        timeout: 300000,
      });
      await ready(page);
      expect(doc().project.name).toBe('Moss Isles');
      expect(doc().project.seed).toBe(seed);
      await expect.poll(() => outputs(folder).length).toBe(2);
      const png = outputs(folder).find((o) => o.label === 'Moss Isles')!;
      expect(png.mimeType).toBe('image/png');
      expect(readFileSync(join(folder, png.path)).subarray(1, 4).toString()).toBe('PNG');
      await collab.click();
      await page.screenshot({ path: join(evidence, 'fmg-agent.png') });
    });
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1700, height: 1050 });
    await page.getByRole('button', { name: /enter/i }).click();
    await test.step('restart: the same world comes back', async () => {
      await ready(page);
      expect(doc().project.seed).toBe(seed);
      expect(doc().project.name).toBe('Moss Isles');
      const shown = await frameOf(page)
        .locator('body')
        .evaluate(() => {
          const g = globalThis as unknown as {
            options?: { map?: { seed?: string; lore?: { name?: string } } };
          };
          return { seed: g.options?.map?.seed, name: g.options?.map?.lore?.name };
        });
      expect(shown.seed).toBe(seed);
      expect(shown.name).toBe('Moss Isles');
      expect(outputs(folder).length).toBe(2);
      await page.screenshot({ path: join(evidence, 'fmg-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
    renameSync(folder, `${folder}-unavailable`);
  }

  const third = await launchApp({});
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1700, height: 1050 });
    await enterGarden(page);
    await test.step('clean Garden: the complete Crux imports and the world opens', async () => {
      await importNativeCrux(page, archive);
      const importedId = (await page
        .locator('[data-workspace-id]')
        .getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, importedId)).projectFolder;
      await ready(page);
      expect(doc().project.seed).toBe(seed);
      expect(outputs(folder).length).toBe(2);
      const shown = await frameOf(page)
        .locator('body')
        .evaluate(() => {
          const g = globalThis as unknown as { options?: { map?: { seed?: string } } };
          return g.options?.map?.seed;
        });
      expect(shown).toBe(seed);
      await page.screenshot({ path: join(evidence, 'fmg-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
