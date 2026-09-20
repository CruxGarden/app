import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, wearMaterial } from './multi-crux-helpers';

/**
 * The Mood browser as it reads now: Material (Plasma or Soft, a hue, a mode,
 * two switches) above the HyperMoods. Shots land in CRUX_TOUR_SHOTS.
 */
const SHOTS = process.env.CRUX_TOUR_SHOTS ?? 'e2e/.results/tour';

test('mood browser: material picker and HyperMoods', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await expect(page.getByTestId('material-moods')).toBeVisible();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/mood-browser.png` });
    // Plasma Fjord through the picker, then its Motion switch.
    await wearMaterial(page, 'plasma-fjord');
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        ),
      )
      .toBe('#2e4f78');
    const motion = page.getByTestId('material-switch-motion');
    await motion.getByRole('button', { name: 'Water' }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--plasma-flow').trim(),
        ),
      )
      .toBe('2');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/mood-browser-fjord.png` });
    // Soft Black through the picker; its Corners switch.
    await wearMaterial(page, 'soft-black');
    await page.getByTestId('material-switch-corners').getByRole('button', { name: 'Hard' }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--radius').trim(),
        ),
      )
      .toBe('0px');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/mood-browser-soft-black-hard.png` });
  } finally {
    await app.close();
  }
});
