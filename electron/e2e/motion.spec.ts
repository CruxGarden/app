import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * Motion is a Theme Token (ADR 0014, ADR 0041): a dialog names its role and
 * the Mood decides what that means. Dialogs, dropdowns and toasts are driven
 * by the Motion library from the same tokens (hooks/useMotionRole); the
 * element carries `data-motion-choice` / `data-motion-exit` for evidence.
 * The Mood pane is a workspace pane (no dialog role), so the dialog-role
 * evidence lives with the dialogs themselves; here: the person's Motion
 * setting, pixel Moods stepping in frames, and the Home ↔ Crux transition.
 */
test.describe('motion roles', () => {
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
    const probe = (
      cls: string,
      prop: 'animationName' | 'animationDuration' | 'animationTimingFunction',
    ) =>
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

      // Plasma, the Default Mood, keeps its motion quiet (fades, a sink, no
      // drift); the full set of roles is exercised under Fractal Garden, a
      // HyperMood that carries them all.
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page
        .getByTestId('bundled-moods')
        .getByTestId('bundled-digital-fractal-garden')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => root('--motion-enter-dialog')).toBe('drift');
      // System, no OS preference: the Mood's default (normal)
      expect(await level()).toBe('normal');
      expect(await root('--motion-intensity-scale')).toBe('1');
      expect(await probe('motion-attention', 'animationName')).toBe('motion-pulse');

      const control = page.getByRole('combobox', { name: 'Motion intensity' });
      await expect(control).toHaveValue('system');

      await control.selectOption('off');
      await expect.poll(level).toBe('off');
      expect(await root('--motion-intensity-scale')).toBe('0');
      expect(await probe('motion-enter-dialog', 'animationDuration')).toBe('0s');

      await control.selectOption('subtle');
      await expect.poll(level).toBe('subtle');
      expect(await probe('motion-attention', 'animationName')).toBe('none');
      expect(await probe('motion-enter-dialog', 'animationName')).toBe('motion-in-drift');

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

      // A Mood may carry its own default: Mountain Grey says subtle
      const built = page.getByTestId('bundled-moods');
      await built
        .getByTestId('bundled-mountain-grey')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(() => root('--motion-intensity')).toBe('subtle');
      await expect.poll(level).toBe('subtle');

      // A pixel Mood steps every role in frames: Raster Bars
      await built.getByTestId('bundled-raster-bars').getByRole('button', { name: 'Apply' }).click();
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
      // Plasma, the Default Mood, leaves pane changes to the material; Fractal Garden fades panes.
      expect(await pane()).toBe('none');
      await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await page
        .getByTestId('bundled-moods')
        .getByTestId('bundled-digital-fractal-garden')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(pane).toBe('fade');
      await page.keyboard.press('Escape');

      await page.evaluate(() => {
        const w = window as unknown as { __vt: number };
        w.__vt = 0;
        const original = document.startViewTransition.bind(document);
        document.startViewTransition = ((cb: () => void | Promise<void>) => {
          w.__vt += 1;
          return original(cb);
        }) as typeof document.startViewTransition;
      });
      // Back to the Garden's Home through its location (the crumb names the Garden, not the person).
      await page.getByRole('button', { name: 'Garden location', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Garden location', exact: true })
        .getByRole('button', { name: 'Close crux', exact: true })
        .click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
      expect(await transitions()).toBe(1);

      // The card being opened names its title before the old screen is captured
      const card = page.getByRole('button', { name: 'Open Moving picture' });
      await card.click();
      await expect(page.locator('[data-workspace-id]')).toBeVisible();
      expect(await transitions()).toBe(2);
      const named = await page.evaluate(
        () =>
          (document.querySelector('[aria-label="Switch Crux workspace"] span') as HTMLElement).style
            .viewTransitionName,
      );
      expect(named).toMatch(/^crux-/);

      // A Mood without a pane enter makes the swap instant: Mountain Grey says none.
      // Mood is a pane: the button toggles it, so open it only when it is not showing.
      const built = page.getByTestId('bundled-moods');
      if (!(await built.isVisible().catch(() => false)))
        await page.getByRole('button', { name: 'Mood', exact: true }).click();
      await built
        .getByTestId('bundled-mountain-grey')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect.poll(pane).toBe('none');
    } finally {
      await app.close();
    }
  });
});
