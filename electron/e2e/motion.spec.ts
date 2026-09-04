import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Motion is a Theme Token (ADR 0014): a dialog carries the role class
 * `.motion-enter-dialog` and the Mood decides what that means. Catppuccin
 * Mocha says `scale`, Sunday Paper says `none` — the same open Mood modal
 * changes its computed animation-name as each is applied, and closing under a
 * Mood with an exit plays `.motion-exit-dialog` before the modal unmounts.
 */
test.describe('motion roles', () => {
  test('the Mood decides how the Mood modal enters and leaves', async () => {
    const { app, page } = await launchApp();
    const cssVar = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('region', { name: 'Mood Bar' })).toBeVisible({
        timeout: 30_000,
      });

      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      const built = page.getByTestId('bundled-moods');
      await expect(built).toBeVisible();
      const dialog = page.locator('.motion-enter-dialog').first();
      const animation = () => dialog.evaluate((el) => getComputedStyle(el).animationName);

      // Garden Dark (the default) fades dialogs in
      expect(await cssVar('--motion-enter-dialog')).toBe('fade');
      expect(await animation()).toBe('motion-in-fade');

      await built
        .getByTestId('bundled-catppuccin-mocha')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--motion-enter-dialog')).toBe('scale');
      await expect.poll(animation).toBe('motion-in-scale');
      // The spring curve travels with the Mood too
      expect(await dialog.evaluate((el) => getComputedStyle(el).animationTimingFunction)).toContain(
        'cubic-bezier',
      );

      await built
        .getByTestId('bundled-sunday-paper')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--motion-enter-dialog')).toBe('none');
      await expect.poll(animation).toBe('none');

      // Closing under Sunday Paper: no exit, the modal is simply gone
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('bundled-moods')).toHaveCount(0);

      // Re-open, back to Catppuccin, and closing now passes through the exit class
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await built
        .getByTestId('bundled-catppuccin-mocha')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--motion-exit-dialog')).toBe('scale');
      await page.evaluate(() => {
        const w = window as unknown as { __sawExit: boolean };
        w.__sawExit = false;
        new MutationObserver((muts) => {
          for (const m of muts) {
            if ((m.target as HTMLElement).classList?.contains('motion-exit-dialog'))
              w.__sawExit = true;
          }
        }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
      });
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('bundled-moods')).toHaveCount(0);
      expect(
        await page.evaluate(() => (window as unknown as { __sawExit: boolean }).__sawExit),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
});
