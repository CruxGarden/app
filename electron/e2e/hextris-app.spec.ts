import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { exportNativeCrux, importNativeCrux } from './native-archive-helpers';

/**
 * Hextris (the actual game, run from source) as a Crux Tool: a game played
 * through the real controls saves its state and high scores as
 * data/project.json, reopens after a restart, the collaborator inspects and
 * resets it through App Tools, a remix of the sources shows on reload, and a
 * complete Crux archive imports into a clean Garden with the source folder gone.
 */
const frameOf = (page: Page) => page.frameLocator('iframe[data-crux-id]');
const status = (page: Page) => frameOf(page).locator('#garden-project [role=status]');
async function ready(page: Page) {
  await expect(status(page)).toHaveText('Saved to Garden', { timeout: 120000 });
  await expect(frameOf(page).locator('#canvas')).toBeVisible();
}
const gameOf = (page: Page) =>
  frameOf(page)
    .locator('body')
    .evaluate(() => {
      const w = window as any;
      return {
        gameState: w.gameState,
        score: w.score,
        saved:
          localStorage.getItem('saveState') !== null && localStorage.getItem('saveState') !== '{}',
        highscores: JSON.parse(localStorage.getItem('highscores') || '[]') as number[],
      };
    });
/** Play for real: start, then rotate the hexagon with the arrow keys while blocks fall. */
async function playABit(page: Page) {
  const frame = frameOf(page);
  // A real click on the start hexagon: a synthetic event lands at (0,0), inside the game's
  // top-left tap-for-help zone, which opens the help screen and pauses.
  await frame.locator('#startBtn').click();
  await expect.poll(() => gameOf(page).then((g) => g.gameState)).toBe(1);
  // Hextris pauses whenever its window blurs, and the test driver's focus changes do that, so
  // for the test the blur handler is dropped (a person keeps the window focused while playing)
  // and the arrow keys are dispatched inside the game's own document.
  await frame.locator('body').evaluate(async () => {
    const w = window as any;
    w.onblur = null;
    if (w.gameState === -1) {
      w.pause(); // unpausing restores the state after its 400 ms fade
      await new Promise((r) => setTimeout(r, 600));
    }
  });
  await expect.poll(() => gameOf(page).then((g) => g.gameState)).toBe(1);
  // Real keyboard input through the iframe (the top-left of the game is its tap-for-help zone,
  // so nothing is clicked).
  await page.locator('iframe[data-crux-id]').focus();
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(250);
  }
}

test('Hextris: real play, saved game and high scores, agent reset, remix, restart and clean import', async () => {
  test.setTimeout(10 * 60_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const evidence = resolve(__dirname, '../../docs/hextris');
  mkdirSync(evidence, { recursive: true });
  const archive = join(first.dir, 'hextris.crux');
  let folder = '';
  const doc = () => JSON.parse(readFileSync(join(folder, 'data/project.json'), 'utf8'));
  const errors: string[] = [];
  try {
    const { page } = first;
    page.setDefaultTimeout(60000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1500, height: 1000 });
    await enterGarden(page);

    await test.step('create from the picker; the game loads from source with no ads or remote fonts', async () => {
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Hextris/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60000 });
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      console.log('Hextris folder', folder);
      await ready(page);
      const html = readFileSync(join(folder, 'index.html'), 'utf8');
      expect(html).not.toMatch(/adsbygoogle|GoogleAnalyticsObject|fonts\.googleapis/);
      expect(existsSync(join(folder, 'js/Block.js'))).toBe(true);
      await page.screenshot({ path: join(evidence, 'hextris-initial.png') });
    });

    await test.step('a person plays; the running game and its state reach data/project.json', async () => {
      await playABit(page);
      const game = await gameOf(page);
      expect(game.gameState).toBe(1);
      // Blocks landed: Hextris wrote its save state, and the bridge saved it.
      await expect.poll(() => doc().project?.saveState ?? '{}', { timeout: 60000 }).not.toBe('{}');
      await ready(page);
      await page.screenshot({ path: join(evidence, 'hextris-playing.png') });
    });

    await test.step('the scripted collaborator inspects and resets progress', async () => {
      // Pause first: a running game keeps writing its state after a reset.
      await frameOf(page)
        .locator('body')
        .evaluate(() => {
          const w = window as any;
          if (w.gameState === 1) w.pause();
        });
      await expect.poll(() => gameOf(page).then((g) => g.gameState)).toBe(-1);
      await ready(page);
      const collab = page.getByRole('button', { name: 'Toggle collaboration' });
      if ((await collab.getAttribute('aria-pressed')) !== 'true') await collab.click();
      const box = page.getByPlaceholder('Send a message...');
      await box.fill('Clear my progress [hextris:reset]');
      await box.press('Enter');
      await expect(
        page.getByText('Cleared the saved game and high scores.', { exact: true }),
      ).toBeVisible({
        timeout: 150000,
      });
      await ready(page);
      expect(doc().project.saveState).toBe('{}');
      expect(doc().project.highscores).toBe('[]');
      await collab.click();
      // Play again so a saved game exists for the restart and the archive.
      await frameOf(page)
        .locator('body')
        .evaluate(() => location.reload());
      await ready(page);
      await playABit(page);
      await expect.poll(() => doc().project?.saveState ?? '{}', { timeout: 60000 }).not.toBe('{}');
      await ready(page);
    });

    await test.step('remix: a source edit changes the game on reload', async () => {
      const path = join(folder, 'js/initialization.js');
      const src = readFileSync(path, 'utf8');
      expect(src).toContain('window.colors = ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71"];');
      const { writeFileSync } = await import('node:fs');
      writeFileSync(path, src.replace('"#e74c3c", "#f1c40f"', '"#ff00ff", "#f1c40f"'));
      await expect.poll(() => readFileSync(path, 'utf8').includes('#ff00ff')).toBe(true);
      // The watcher ingests the external edit into the store; the archive is made from the store.
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      const { createHash } = await import('node:crypto');
      const fingerprint = createHash('sha256').update(readFileSync(path)).digest('hex');
      await expect
        .poll(
          () =>
            page.evaluate(
              async ([cruxId, p]) =>
                (
                  (await window.electronAPI!.sqlite.get(
                    'SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?',
                    [cruxId, p],
                  )) as { fingerprint: string } | undefined
                )?.fingerprint,
              [id, 'js/initialization.js'],
            ),
          { timeout: 60000 },
        )
        .toBe(fingerprint);
      await frameOf(page)
        .locator('body')
        .evaluate(() => location.reload());
      await ready(page);
      expect(
        await frameOf(page)
          .locator('body')
          .evaluate(() => (window as any).colors[0]),
      ).toBe('#ff00ff');
    });
    expect(errors).toEqual([]);
  } finally {
    await first.app.close();
  }

  const second = await launchApp({ dir: first.dir });
  try {
    const { page } = second;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await test.step('restart: the saved game is offered again and the remix holds', async () => {
      await page.getByRole('button', { name: /enter/i }).click();
      await ready(page);
      expect((await gameOf(page)).saved).toBe(true);
      expect(
        await frameOf(page)
          .locator('body')
          .evaluate(() => (window as any).colors[0]),
      ).toBe('#ff00ff');
      await page.screenshot({ path: join(evidence, 'hextris-reopened.png') });
      await exportNativeCrux(page, archive, second.app);
    });
  } finally {
    await second.app.close();
  }

  renameSync(folder, `${folder}-unavailable`);
  const third = await launchApp();
  try {
    const { page } = third;
    page.setDefaultTimeout(60000);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await test.step('clean Garden: the complete Crux imports with its saved game and remix', async () => {
      await enterGarden(page);
      await importNativeCrux(page, archive);
      const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
      folder = (await storedCrux(page, id)).projectFolder;
      await ready(page);
      expect((await gameOf(page)).saved).toBe(true);
      expect(
        await frameOf(page)
          .locator('body')
          .evaluate(() => (window as any).colors[0]),
      ).toBe('#ff00ff');
      await page.screenshot({ path: join(evidence, 'hextris-imported.png') });
    });
  } finally {
    await third.app.close();
  }
});
