import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

type AudioState = { trackName: string | null; enabled: boolean };

/**
 * The twenty built-in Moods apply as whole rooms: theme tokens, background,
 * sound and persona change together. The Keeper — the Default Mood — brings
 * its own background image and track.
 */
test.describe('bundled moods', () => {
  test('apply Windows 95 then Blade Runner Rain: shape, sound and voice follow', async () => {
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
      // A fresh garden wears The Keeper: Moss accent, the vista, the track
      await expect.poll(() => cssVar('--accent'), { timeout: 30_000 }).toBe('#88bc88');
      await expect.poll(() => cssVar('--background-type')).toBe('image');
      await expect(page.getByTestId('mood-background-image')).toBeVisible();
      await expect.poll(async () => (await audio()).trackName).toBe('Echoes Beyond the Signal');

      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      const built = page.getByTestId('bundled-moods');
      await expect(built).toBeVisible();
      await expect(built.locator('[data-testid^="bundled-"]')).toHaveCount(20);

      await built.getByTestId('bundled-windows-95').getByRole('button', { name: 'Apply' }).click();
      await expect.poll(() => cssVar('--radius')).toBe('0px');
      // Windows 95 is quiet: no track, sound still on
      await expect.poll(async () => (await audio()).trackName).toBeNull();
      expect((await audio()).enabled).toBe(true);

      await built
        .getByTestId('bundled-blade-runner-rain')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--accent')).toBe('#ff6a1a');
      await expect.poll(() => cssVar('--background-type')).toBe('flow');
      await page.screenshot({ path: 'e2e/.results/bundled-1-blade-runner.png' });

      // The persona rides along: the chat greeting is Deckard's
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByText('Deckard').first()).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'e2e/.results/bundled-2-workspace.png' });

      // Back to The Keeper from the browser: the track and the vista return
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await built.getByTestId('bundled-the-keeper').getByRole('button', { name: 'Apply' }).click();
      await expect.poll(async () => (await audio()).trackName).toBe('Echoes Beyond the Signal');
      await expect.poll(() => cssVar('--background-type')).toBe('image');
      await page.keyboard.press('Escape');
      // A new crux greets with the Keeper's voice; its face sits on a theme gradient
      await page.getByRole('button', { name: /^wanderer-/ }).click(); // the username → Home Garden
      await page.getByRole('button', { name: 'Add Crux' }).click({ timeout: 30_000 });
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByText('The Keeper tends the garden').first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('persona-avatar').first()).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
