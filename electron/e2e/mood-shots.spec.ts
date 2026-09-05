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
  'plain-form',
  'catppuccin-mocha',
  'geocities',
  'graphite',
  'soft-serve',
  'soft-serve-night',
];

test.describe('bundled mood screenshots', () => {
  test.skip(!process.env.CRUX_SHOTS, 'set CRUX_SHOTS=1');
  test.setTimeout(6 * 60_000);

  test('one shot per Mood', async () => {
    const { app, page } = await launchApp();
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    const mixName = () =>
      page.evaluate(
        () =>
          (
            window as unknown as { __cruxAudio: { state: () => { mixName: string | null } } }
          ).__cruxAudio.state().mixName,
      );
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
        const before = { accent: await cssVar('--accent'), mix: await mixName() };
        await page.getByRole('button', { name: 'Mood', exact: true }).click();
        const built = page.getByTestId('bundled-moods');
        await built.getByTestId(`bundled-${id}`).getByRole('button', { name: 'Apply' }).click();
        // Applied: the palette and the soundscape both moved off the previous Mood's
        await expect.poll(() => cssVar('--accent')).not.toBe(before.accent);
        await expect.poll(mixName).not.toBe(before.mix);
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('bundled-moods')).toHaveCount(0);
        if (id === 'graphite') {
          await page.getByRole('button', { name: 'Toggle metadata' }).click();
          await page.getByRole('button', { name: 'Toggle artifacts' }).click();
          await expect(page.locator('.pane-artifacts').getByRole('tree')).toBeVisible();
        }
        await page.mouse.move(0, 0);
        // The palette transition is 400ms (globals.css); let it finish before the shot
        await page.waitForTimeout(500);
        await page.screenshot({ path: `e2e/.results/mood-${id}.png` });
      }
    } finally {
      await app.close();
    }
  });
});
