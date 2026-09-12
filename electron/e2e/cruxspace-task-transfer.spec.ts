import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { home, member, open, openWorkshop, nativeReady, collaborator } from './game-cruxspace-helpers';
/**
 * Regression (GAME-CRUXSPACE-PLAN.md §9 #9): a Cruxspace transfer made by the
 * collaborator during a turn on a Task of a native app used to checkpoint the
 * receiving copy while holding its serialization lock; the turn's own snapshot
 * then waited on that lock, the app's save waited on the snapshot, and the
 * bridge timed out. The turn must finish and the copy must land.
 */
test('a Cruxspace transfer during a Task turn on a native app completes', async () => {
  test.setTimeout(900000);
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await enterGarden(page);
    const sprites = await member(page, /^Piskel/, 'Sprites');
    await nativeReady(page);
    await page.frameLocator('iframe[data-crux-id]').locator('#drawing-canvas-container').click({ position: { x: 180, y: 400 }, delay: 100 });
    await collaborator(page, 'Share the sheet [game:sprite]', 'Set the walk speed and saved the sheet to the Cruxspace.');
    const game = await member(page, /^GDevelop/, 'Game');
    await nativeReady(page);
    await home(page);
    await page.getByRole('button', { name: 'Create Cruxspace', exact: true }).click();
    await page.getByLabel('Cruxspace name').fill('Repro');
    for (const t of [sprites.title, game.title]) await page.getByRole('checkbox', { name: t, exact: true }).check();
    await page.getByRole('button', { name: 'Save Cruxspace', exact: true }).click();
    await open(page, 'Game');
    await nativeReady(page);
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await page.getByRole('textbox', { name: 'Task name', exact: true }).fill('Repro task');
    await page.getByRole('button', { name: 'Save and start task' }).click();
    await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible({ timeout: 300000 });
    await openWorkshop(page);
    await nativeReady(page);
    await collaborator(page, 'Copy the sheet in [cruxspace:cover]', 'Done — copied the selected Cruxspace artwork.');
    await expect(page.getByRole('button', { name: 'use_cruxspace_asset' })).toBeVisible();
  } finally { await app.close(); }
});
