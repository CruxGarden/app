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

  /**
   * Motion intensity (ADR 0041): the person's one knob. `System` follows the
   * Mood's default and the OS reduced-motion preference; off is instant,
   * subtle stops the loops, expressive lets every enter take the spring curve;
   * a pixel Mood steps its motion in frames.
   */
  test("the person's Motion setting scales and gates the Mood's motion; pixel Moods step in frames", async () => {
    const { app, page } = await launchApp();
    const root = (name: string) =>
      page.evaluate(
        (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
        name,
      );
    const level = () => page.evaluate(() => document.documentElement.dataset.motionIntensity);
    // Probe elements carrying role classes, so the check does not depend on what is on screen.
    const probe = (cls: string, prop: 'animationName' | 'animationDuration' | 'animationTimingFunction') =>
      page.evaluate(
        ([c, p]) => {
          const el = document.createElement('div');
          el.className = c!;
          document.body.appendChild(el);
          const v = getComputedStyle(el)[p as 'animationName'];
          el.remove();
          return v;
        },
        [cls, prop],
      );
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await expect(page.getByRole('region', { name: 'Mood Bar' })).toBeVisible({ timeout: 30_000 });

      // System, no OS preference: the Mood's default (normal)
      expect(await level()).toBe('normal');
      expect(await root('--motion-intensity-scale')).toBe('1');
      expect(await probe('motion-attention', 'animationName')).toBe('motion-pulse');

      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      const control = page.getByRole('combobox', { name: 'Motion intensity' });
      await expect(control).toHaveValue('system');

      await control.selectOption('off');
      await expect.poll(level).toBe('off');
      expect(await root('--motion-intensity-scale')).toBe('0');
      expect(await probe('motion-enter-dialog', 'animationDuration')).toBe('0s');

      await control.selectOption('subtle');
      await expect.poll(level).toBe('subtle');
      expect(await probe('motion-attention', 'animationName')).toBe('none');
      expect(await probe('motion-enter-dialog', 'animationName')).toBe('motion-in-fade');

      await control.selectOption('expressive');
      await expect.poll(level).toBe('expressive');
      expect(await probe('motion-enter-dialog', 'animationTimingFunction')).toBe(
        await root('--motion-ease-spring'),
      );

      // Back to System: the OS asking for reduced motion means off; an explicit choice overrides it
      await control.selectOption('system');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect.poll(level).toBe('off');
      await control.selectOption('normal');
      await expect.poll(level).toBe('normal');
      expect(await probe('motion-enter-dialog', 'animationDuration')).not.toBe('0s');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await control.selectOption('system');
      await expect.poll(level).toBe('normal');

      // A Mood may carry its own default: Siberian Blizzard says subtle
      const built = page.getByTestId('bundled-moods');
      await built.getByTestId('bundled-siberian-blizzard').getByRole('button', { name: 'Apply' }).click();
      await expect.poll(() => root('--motion-intensity')).toBe('subtle');
      await expect.poll(level).toBe('subtle');

      // A pixel Mood steps every role in frames
      await built.getByTestId('bundled-8-bit').getByRole('button', { name: 'Apply' }).click();
      await expect.poll(() => root('--motion-frames')).toBe('4');
      await expect.poll(level).toBe('normal');
      expect(await probe('motion-enter-dialog', 'animationTimingFunction')).toBe('steps(4)');
      expect(await probe('motion-press', 'animationName')).toBe('none');
    } finally {
      await app.close();
    }
  });
});
