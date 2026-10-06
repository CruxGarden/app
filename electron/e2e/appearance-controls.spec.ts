import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('simple appearance controls resize the app, save colors, and reset after restart', async () => {
  const first = await launchApp();
  const { page, dir } = first;
  let baselineFont = '';
  try {
    await enterGarden(page);
    await createCrux(page, 'Comfortable workspace');
    baselineFont = await page.locator('html').evaluate((el) => getComputedStyle(el).fontSize);
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByRole('button', { name: 'Theme', exact: true }).click();
    const appearance = page.getByRole('region', { name: 'Appearance', exact: true });
    await expect(appearance).toBeVisible();
    const size = appearance.getByRole('slider', { name: 'Text size', exact: true });
    await size.focus();
    await size.press('End');
    await expect(page.locator('html')).toHaveCSS('font-size', '24px');
    await appearance.getByLabel('Accent color', { exact: true }).fill('#bb7722');
    await appearance.getByLabel('Background color', { exact: true }).fill('#18283a');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent')))
      .toBe('#bb7722');
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue('--plasma-background')),
      )
      .toBe('#18283a');
    await expect(appearance.getByRole('button', { name: 'Reset appearance' })).toBeVisible();
    await page.screenshot({ path: 'e2e/.results/appearance-large.png' });
    await page.keyboard.press('Escape');
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir });
  try {
    const page = second.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(page.locator('html')).toHaveCSS('font-size', '24px');
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByRole('button', { name: 'Theme', exact: true }).click();
    const appearance = page.getByRole('region', { name: 'Appearance', exact: true });
    await expect(appearance.getByLabel('Accent color', { exact: true })).toHaveValue('#bb7722');
    await expect(appearance.getByLabel('Background color', { exact: true })).toHaveValue('#18283a');
    await appearance.getByRole('button', { name: 'Reset appearance' }).click();
    await expect(appearance.getByRole('button', { name: 'Reset appearance' })).toBeDisabled();
    await expect(page.locator('html')).toHaveCSS('font-size', baselineFont);
    await page.screenshot({ path: 'e2e/.results/appearance-reset.png' });
  } finally {
    await second.app.close();
  }
});
