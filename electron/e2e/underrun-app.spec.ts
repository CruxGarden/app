import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * Underrun (the actual js13k game, run from source) as a Crux: it starts on a
 * click, renders through WebGL and ticks; a source edit is live on reload; the
 * complete Crux archive imports into a clean Garden with the folder gone and plays.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const tick = (page: Page) =>
  frameOf(page)
    .locator('body')
    .evaluate(() => (window as any).time_last as number); // assigned every frame by game_tick
async function startAndPlay(page: Page) {
  const frame = frameOf(page);
  await expect(frame.locator('#c')).toBeVisible();
  // The game waits for a click (it also unlocks audio), then loads level 1.
  // The click handler is installed once the audio is set up; keep clicking until the first level loads.
  await expect
    .poll(
      async () => {
        await frame.locator('#c').click({ position: { x: 100, y: 100 } });
        return frame.locator('body').evaluate(() => (window as any).current_level as number);
      },
      { timeout: 60000, intervals: [1000] },
    )
    .toBeGreaterThanOrEqual(1);
  const before = await tick(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  expect(await tick(page)).toBeGreaterThan(before);
  expect(
    await frame.locator('body').evaluate(() => (window as any).current_level),
  ).toBeGreaterThanOrEqual(1);
}

test('Underrun: plays from source, remixes on reload, imports into a clean Garden', async () => {
  test.setTimeout(8 * 60_000);
  const first = await launchApp();
  const evidence = resolve(__dirname, '../../docs/underrun');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'underrun.crux');
  let folder = '';
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1500, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the game starts and ticks', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Underrun/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('Underrun folder', folder);
      await startAndPlay(page);
      await page.screenshot({ path: join(evidence, 'underrun-playing.png') });
    });

    await test.step('remix: a source edit is live on reload', async () => {
      const path = join(folder, 'source/main.js');
      const src = readFileSync(path, 'utf8');
      expect(src).toContain("terminal_write_line('INITIATING...');");
      writeFileSync(
        path,
        src.replace(
          "terminal_write_line('INITIATING...');",
          "terminal_write_line('GARDEN REMIX...');",
        ),
      );
      await expect.poll(() => readFileSync(path, 'utf8').includes('GARDEN REMIX')).toBe(true);
      await frameOf(page)
        .locator('body')
        .evaluate(() => location.reload());
      await expect(frameOf(page).locator('#a')).toContainText('GARDEN REMIX', { timeout: 60000 });
      await page.screenshot({ path: join(evidence, 'underrun-remix.png') });
      // A source-run game has no Workshop bar; the Export pane opens from the top bar.
      await exportNativeCrux(page, archive, first.app, () =>
        page.getByRole('button', { name: 'Toggle export' }).click(),
      );
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  renameSync(folder, `${folder}-unavailable`);
  const second = await launchApp();
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await test.step('clean Garden: the complete Crux imports and the remixed game plays', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      // A source-run game carries no Workshop layout in its archive; open the pane.
      if (!(await page.locator('iframe[data-crux-id]').count()))
        await page.getByRole('button', { name: 'Toggle workshop' }).click();
      await expect(frameOf(page).locator('#a')).toContainText('GARDEN REMIX', { timeout: 60000 });
      await startAndPlay(page);
      await page.screenshot({ path: join(evidence, 'underrun-imported.png') });
    });
  } finally {
    await second.app.close();
  }
});
