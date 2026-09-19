import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { createCrux, enterGarden } from './multi-crux-helpers';

/** Evidence: a Mood that is not the Plasma Mood, wearing the plasma surface — the base defaults. */
const SHOTS = process.env.CRUX_TOUR_SHOTS ?? 'e2e/.results/tour';
test('another Mood under plasma', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await page.locator('header').getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByTestId('bundled-night-city').getByRole('button', { name: 'Apply' }).click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const html = document.documentElement;
      html.style.setProperty('--surface-style', 'plasma');
      html.dataset.surfaceStyle = 'plasma';
      document.dispatchEvent(new Event('palette-change'));
    });
    await expect(page.locator('html')).toHaveAttribute('data-surface-style', 'plasma');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/other-mood-home.png` });
    await createCrux(page, 'Night');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/other-mood-builder.png` });
  } finally {
    await app.close();
  }
});
