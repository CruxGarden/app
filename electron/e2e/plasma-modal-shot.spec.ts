import { test } from '@playwright/test';
import { launchApp } from './launch';
import { createCrux, enterGarden } from './multi-crux-helpers';

/**
 * Evidence, not a gate: a dialog under the Plasma theme, drawn by its own
 * overlay canvas above the scrim. Shots land in CRUX_TOUR_SHOTS.
 */
const SHOTS = process.env.CRUX_TOUR_SHOTS ?? 'e2e/.results/tour';
test('plasma modal shot', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    // Mid-form: the material is still arriving and the contents wait for it.
    await page.waitForTimeout(140);
    await page.screenshot({ path: `${SHOTS}/plasma-modal-forming.png` });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/plasma-modal-add-crux.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/plasma-home.png` });
    await page.keyboard.press('ControlOrMeta+,');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/plasma-modal-settings.png` });
    await page.keyboard.press('Escape');
    await createCrux(page, 'Material');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/plasma-builder.png` });
  } finally {
    await app.close();
  }
});
