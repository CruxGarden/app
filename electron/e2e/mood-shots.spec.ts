import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Screenshots of every bundled Mood on a real workspace (opt-in):
 *   CRUX_SHOTS=1 npx playwright test e2e/mood-shots.spec.ts
 * Output: e2e/.results/mood-<id>.png
 */
const IDS = [
  'rainy-day-cafe',
  'spring-morning',
  'snowed-in',
  'blade-runner-rain',
  'lofi-study-cafe',
  'windows-95',
  'solarpunk-garden',
  'terminal',
  'sunday-paper',
  'deep-sea',
  'pretty-in-pink',
];

test.describe('bundled mood screenshots', () => {
  test.skip(!process.env.CRUX_SHOTS, 'set CRUX_SHOTS=1');
  test.setTimeout(6 * 60_000);

  test('one shot per Mood', async () => {
    const { app, page } = await launchApp();
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      // A crux with a file so the workspace has content to style
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /Astro Blog/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('button', { name: /new post/i }).first()).toBeVisible({
        timeout: 30_000,
      });
      await page.getByText('Hello, world').first().click();
      await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 });
      await page
        .getByRole('button', { name: 'Toggle metadata' })
        .click()
        .catch(() => {});

      for (const id of IDS) {
        await page.getByRole('button', { name: 'Mood', exact: true }).click();
        const built = page.getByTestId('bundled-moods');
        await built.getByTestId(`bundled-${id}`).getByRole('button', { name: 'Apply' }).click();
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1200); // background + transitions settle
        await page.screenshot({ path: `e2e/.results/mood-${id}.png` });
      }
    } finally {
      await app.close();
    }
  });
});
