import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

type AudioState = { mixName: string | null; mixCount: number };

/**
 * The fourteen built-in Moods apply as whole rooms: theme tokens, background,
 * soundscape and persona change together, and the user's own mixes survive.
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
      const before = (await audio()).mixCount;

      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      const built = page.getByTestId('bundled-moods');
      await expect(built).toBeVisible();
      await expect(built.locator('[data-testid^="bundled-"]')).toHaveCount(14);

      await built.getByTestId('bundled-windows-95').getByRole('button', { name: 'Apply' }).click();
      await expect.poll(() => cssVar('--radius')).toBe('0px');
      await expect.poll(async () => (await audio()).mixName).toBe('Office Hum');
      expect((await audio()).mixCount).toBe(before + 1); // merged, not replaced

      await built
        .getByTestId('bundled-blade-runner-rain')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--accent')).toBe('#ff6a1a');
      await expect.poll(async () => (await audio()).mixName).toBe('Neon Rain');
      await expect.poll(() => cssVar('--background-type')).toBe('flow');
      await page.screenshot({ path: 'e2e/.results/bundled-1-blade-runner.png' });

      // The persona rides along: the chat greeting is Deckard's
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByText('Deckard').first()).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: 'e2e/.results/bundled-2-workspace.png' });
    } finally {
      await app.close();
    }
  });
});
