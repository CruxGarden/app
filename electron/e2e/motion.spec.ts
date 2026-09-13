import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Motion is a Theme Token (ADR 0014, ADR 0041): a dialog names its role and
 * the Mood decides what that means. Dialogs, dropdowns and toasts are driven
 * by the Motion library from the same tokens (hooks/useMotionRole); the
 * element carries `data-motion-choice` / `data-motion-exit` for evidence.
 * Catppuccin Mocha says `scale`, Sunday Paper says `none` — the same open
 * Mood modal changes as each is applied, and closing under a Mood with an
 * exit plays it (inline styles move) before the modal unmounts.
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
      const dialog = page.locator('[data-motion-role="dialog"]').first();
      const choice = () => dialog.getAttribute('data-motion-choice');

      // Garden Dark (the default) fades dialogs in
      expect(await cssVar('--motion-enter-dialog')).toBe('fade');
      expect(await choice()).toBe('fade');
      // The enter settled at the rest state Motion wrote inline
      await expect(dialog).toHaveCSS('opacity', '1');

      await built
        .getByTestId('bundled-catppuccin-mocha')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--motion-enter-dialog')).toBe('scale');
      await expect.poll(choice).toBe('scale');
      // The spring travels with the Mood too: a pop would read the snappy spring token
      expect(await cssVar('--motion-spring-snappy')).toMatch(/^\d+ \d+ \d+$/);

      await built
        .getByTestId('bundled-sunday-paper')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--motion-enter-dialog')).toBe('none');
      await expect.poll(choice).toBe('none');
      expect(await dialog.getAttribute('data-motion-exit')).toBe('none');

      // Closing under Sunday Paper: no exit, the modal is simply gone
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('bundled-moods')).toHaveCount(0);

      // Re-open, back to Catppuccin, and closing now plays the exit: the element
      // stays mounted while Motion moves its inline style, then goes.
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await built
        .getByTestId('bundled-catppuccin-mocha')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => cssVar('--motion-exit-dialog')).toBe('scale');
      await expect.poll(() => dialog.getAttribute('data-motion-exit')).toBe('scale');
      await expect(dialog).toHaveCSS('opacity', '1');
      await page.evaluate(() => {
        const w = window as unknown as { __sawExit: boolean };
        w.__sawExit = false;
        const el = document.querySelector('[data-motion-role="dialog"]')!;
        new MutationObserver(() => {
          const opacity = parseFloat((el as HTMLElement).style.opacity || '1');
          if (opacity < 1) w.__sawExit = true;
        }).observe(el, { attributes: true, attributeFilter: ['style'] });
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

  /**
   * Screen changes (ADR 0041): opening a Crux from Home and going back run
   * through document.startViewTransition; the Mood's pane-enter choice is
   * mirrored on <html data-motion-pane> for the ::view-transition rules, and
   * the opened card's title carries the name the breadcrumb takes over.
   */
  test('Home ↔ Crux changes screens through a view transition shaped by the Mood', async () => {
    const { app, page } = await launchApp();
    const pane = () => page.evaluate(() => document.documentElement.dataset.motionPane);
    const transitions = () =>
      page.evaluate(() => (window as unknown as { __vt: number }).__vt ?? 0);
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByPlaceholder('My Crux').fill('Moving picture');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      // Garden Dark says none for panes: the swap is instant, still a transition
      expect(await pane()).toBe('none');

      await page.evaluate(() => {
        const w = window as unknown as { __vt: number };
        w.__vt = 0;
        const original = document.startViewTransition.bind(document);
        document.startViewTransition = ((cb: () => void | Promise<void>) => {
          w.__vt += 1;
          return original(cb);
        }) as typeof document.startViewTransition;
      });
      await page.getByRole('button', { name: 'wanderer', exact: false }).first().click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
      expect(await transitions()).toBe(1);

      // The card being opened names its title before the old screen is captured
      const card = page.getByRole('button', { name: 'Open Moving picture' });
      await card.click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      expect(await transitions()).toBe(2);
      const named = await page.evaluate(
        () =>
          (document.querySelector('[aria-label="Switch Crux workspace"] span') as HTMLElement)
            .style.viewTransitionName,
      );
      expect(named).toMatch(/^crux-/);

      // A Mood with a pane enter shapes the arrival: Spring Morning says fade
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page
        .getByTestId('bundled-moods')
        .getByTestId('bundled-spring-morning')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(pane).toBe('fade');
    } finally {
      await app.close();
    }
  });
});
