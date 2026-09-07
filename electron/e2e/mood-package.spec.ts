import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

type AudioState = { volume: number; trackName: string | null };

/**
 * Phase 4: save what you're wearing as a Mood, change everything, apply the
 * Mood — theme token, background type and soundscape come back together.
 */
test.describe('mood packages', () => {
  test.setTimeout(150_000);

  test('save current look, change, apply, delete', async () => {
    const { app, page } = await launchApp();
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    const audio = () =>
      page.evaluate(() =>
        (window as unknown as { __cruxAudio: { state: () => AudioState } }).__cruxAudio.state(),
      );
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('region', { name: 'Mood Bar' })).toBeVisible({
        timeout: 30_000,
      });

      // Shape a look: pane gap 0 + a quieter track
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page.getByRole('button', { name: 'Open Mood Builder' }).click();
      await page.getByRole('button', { name: 'Theme', exact: true }).click();
      await page.getByRole('button', { name: 'Shape & layout' }).click();
      const gap = page.getByRole('textbox', { name: 'Pane gap value' });
      await gap.fill('0px');
      await gap.press('Enter');
      await expect.poll(() => cssVar('--pane-gap')).toBe('0px');
      await page.getByRole('button', { name: 'Sound', exact: true }).click();
      await page.getByRole('slider', { name: 'Track volume' }).fill('0.25');
      await expect.poll(async () => (await audio()).volume).toBe(0.25);

      // Save it as a Mood
      await page.getByRole('button', { name: 'Moods', exact: true }).click();
      await page.getByRole('button', { name: 'Save current as Mood' }).click();
      await page.getByRole('textbox', { name: 'Mood name' }).fill('Night Shift');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Saved "Night Shift"');
      await expect(page.getByTestId('mood-mood-night-shift')).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/mood-package-1-browser.png' });

      // Change everything: preset Ember (gap back to default via preset), volume up
      await page.getByRole('button', { name: 'Theme', exact: true }).click();
      await page.getByRole('button', { name: 'Ember' }).click();
      await page.getByRole('button', { name: 'Reset all' }).click();
      await expect.poll(() => cssVar('--pane-gap')).toBe('4px');
      await page.getByRole('button', { name: 'Sound', exact: true }).click();
      await page.getByRole('slider', { name: 'Track volume' }).fill('0.9');
      await expect.poll(async () => (await audio()).volume).toBe(0.9);

      // Apply the saved Mood: both come back
      await page.getByRole('button', { name: 'Moods', exact: true }).click();
      await page
        .getByTestId('mood-mood-night-shift')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect(page.getByRole('status')).toContainText('Now wearing "Night Shift"');
      await expect.poll(() => cssVar('--pane-gap')).toBe('0px');
      await expect.poll(async () => (await audio()).volume).toBe(0.25);
      expect((await audio()).trackName).toBe('Echoes Beyond the Signal'); // the Keeper's track rode along

      // The theme became a preset under Yours as well
      await page.getByRole('button', { name: 'Theme', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Night Shift', exact: true })).toBeVisible();

      // Delete the Mood
      await page.getByRole('button', { name: 'Moods', exact: true }).click();
      await page.getByRole('button', { name: 'Delete Mood Night Shift' }).click();
      await expect(page.getByTestId('mood-mood-night-shift')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
