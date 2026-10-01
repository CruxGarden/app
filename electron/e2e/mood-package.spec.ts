import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { showPane } from './panel-helpers';
import { enterGarden } from './multi-crux-helpers';

type AudioState = { volume: number; trackName: string | null };

/**
 * Phase 4: save what you're wearing as a Mood, change everything, apply the
 * Mood — theme token, background type and soundscape come back together.
 */
test.describe('mood packages', () => {
  test.setTimeout(150_000);

  test('save current look, change, apply, delete', async () => {
    const { app, page } = await launchApp({ sound: true });
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
      await enterGarden(page);

      // Shape a look: pane gap 0 + a quieter track
      await showPane(page, 'Mood');
      await page.getByRole('button', { name: 'Theme', exact: true }).click();
      await page.getByRole('button', { name: 'Shape & layout' }).click();
      const gap = page.getByRole('textbox', { name: 'Pane gap value' });
      await gap.fill('0px');
      await gap.press('Enter');
      await expect.poll(() => cssVar('--pane-gap')).toBe('0px');
      await page.getByRole('button', { name: 'Sound', exact: true }).click();
      await page.getByRole('slider', { name: 'Synth master volume' }).fill('0.25');
      await expect.poll(async () => (await audio()).volume).toBe(0.25);

      // Save it as a Mood
      await page.getByRole('button', { name: 'Moods', exact: true }).click();
      await page.getByRole('button', { name: 'Save current as Mood' }).click();
      await page.getByRole('textbox', { name: 'Mood name' }).fill('Night Shift');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Saved "Night Shift"');
      const apply = page.getByRole('button', { name: 'Apply Night Shift', exact: true });
      await expect(apply).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/mood-package-1-browser.png' });

      // Change everything: preset Ember (gap back to default via preset), volume up
      await page.getByRole('button', { name: 'Theme', exact: true }).click();
      await page.getByRole('button', { name: 'Ember', exact: true }).click();
      await page.getByRole('button', { name: 'Reset all' }).click();
      await expect.poll(() => cssVar('--pane-gap')).toBe('4px');
      await page.getByRole('button', { name: 'Sound', exact: true }).click();
      await page.getByRole('slider', { name: 'Synth master volume' }).fill('0.9');
      await expect.poll(async () => (await audio()).volume).toBe(0.9);

      // Apply the saved Mood: both come back
      await page.getByRole('button', { name: 'Moods', exact: true }).click();
      await apply.click();
      await expect(page.getByRole('region', { name: 'Garden Mood' })).toContainText(
        'wears Night Shift',
      );
      await expect.poll(() => cssVar('--pane-gap')).toBe('0px');
      await expect.poll(async () => (await audio()).volume).toBe(0.25);
      expect((await audio()).trackName).toBe('Crux Synth'); // the Keeper's track rode along

      // The theme became a preset under Yours as well
      await page.getByRole('button', { name: 'Theme', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Night Shift', exact: true })).toBeVisible();

      // Delete the Mood
      await page.getByRole('button', { name: 'Moods', exact: true }).click();
      await expect(apply).toHaveAttribute('aria-pressed', 'true');
      // A Garden's chosen Mood cannot disappear under it: choose another first.
      const remove = page.getByRole('button', { name: 'Delete Mood Night Shift' });
      await expect(remove).toBeDisabled();
      await page
        .getByRole('region', { name: 'Garden Mood' })
        .getByRole('button', { name: 'Use the Default Mood' })
        .click();
      await expect(remove).toBeEnabled();
      await remove.click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Delete locally', exact: true })
        .click();
      await expect(apply).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
