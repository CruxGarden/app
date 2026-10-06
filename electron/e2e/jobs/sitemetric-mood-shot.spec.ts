import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { enterGarden, createCrux, openMoodShelf } from '../multi-crux-helpers';

/**
 * The Sitemetric Mood, photographed (opt-in: `CRUX_MOOD_SHOTS=1`).
 *
 * Soft Black with the company's red carrying the accent and every pane, so
 * the shots are the way to judge it: the garden, a dialog, and a workspace
 * where the panes are the thing being coloured.
 */
const SHOTS = process.env.CRUX_TOUR_SHOTS ?? 'e2e/.results/sitemetric';

test('sitemetric mood shots', async () => {
  test.skip(process.env.CRUX_MOOD_SHOTS !== '1', 'set CRUX_MOOD_SHOTS=1 to take these');
  test.setTimeout(180_000);
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1500, height: 950 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await openMoodShelf(page);
    await page.getByTestId('bundled-sitemetric').getByRole('button', { name: 'Apply' }).click();
    await page.keyboard.press('Escape');

    // The red took, or the shots are of something else.
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        ),
      )
      .toBe('#e70022');

    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/sitemetric-home.png` });

    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/sitemetric-dialog.png` });
    await page.keyboard.press('Escape');

    // A workspace: the panes are what the red is really for.
    await createCrux(page, 'Shell app');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${SHOTS}/sitemetric-workspace.png` });
  } finally {
    await app.close();
  }
});
