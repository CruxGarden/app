import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, openMoodShelf, wearMaterial } from './multi-crux-helpers';

/**
 * The Office Mood: Plasma turned all the way down — shots of the garden,
 * the builder and a dialog, to see what a business Mood gets from the
 * material and what it still lacks. Shots land in CRUX_TOUR_SHOTS.
 */
const SHOTS = process.env.CRUX_TOUR_SHOTS ?? 'e2e/.results/tour';
/** Which bundled Mood to wear (default Office) and the accent that proves it took. */
const MOOD = process.env.CRUX_MOOD_ID ?? 'office';
const ACCENT = process.env.CRUX_MOOD_ACCENT ?? '#2f6fed';

test('office mood shots', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    if (MOOD === 'office') {
      await openMoodShelf(page);
      await page.getByTestId('bundled-office').getByRole('button', { name: 'Apply' }).click();
    } else await wearMaterial(page, MOOD);
    await page.keyboard.press('Escape');
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        ),
      )
      .toBe(ACCENT);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/${MOOD}-home.png` });
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/${MOOD}-dialog.png` });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/${MOOD}-menu.png` });
    await page.keyboard.press('Escape');
    await createCrux(page, 'Quarterly plan');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/${MOOD}-builder.png` });
  } finally {
    await app.close();
  }
});
