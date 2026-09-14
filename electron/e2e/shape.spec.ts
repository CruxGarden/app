import { test, expect, type Page } from '@playwright/test';
import { launchApp } from './launch';

async function openWorkspace(page: Page) {
  await page.getByRole('button', { name: /enter/i }).click();
  await page.getByText('Plant a new garden').click();
  await page.getByRole('button', { name: 'Welcome' }).click();
  await page.getByRole('button', { name: 'Add Crux' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.mosaic-window.pane-collaboration')).toBeVisible();
}

async function applyMood(page: Page, id: string) {
  await page.getByRole('button', { name: 'Mood', exact: true }).click();
  await page.getByTestId(`bundled-${id}`).getByRole('button', { name: 'Apply' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('bundled-moods')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mood', exact: true }).hover();
}

/**
 * Shape is a Theme Token (ADR 0014). The bundled set stays square-ish (ADR
 * 0043): corners are round or bevel, frames solid; what still moves between
 * Moods is the corner shape, the radius, the header shape and the glyph set,
 * and this inspects the painted chrome, not just the tokens on <html>.
 */
test('Moods change pane corners, radius and header geometry without reopening the Crux', async () => {
  const { app, page } = await launchApp();
  try {
    await openWorkspace(page);
    const pane = page.locator('.mosaic-window.pane-collaboration');
    const header = pane.locator('.pane-toolbar');
    const toolbar = pane.locator(':scope > .mosaic-window-toolbar');

    // Concrete Sky: bevelled corners, a tight radius, a solid hairline frame
    await applyMood(page, 'concrete-sky');
    await expect(pane).toHaveCSS('corner-shape', 'bevel');
    await expect(pane).toHaveCSS('border-top-left-radius', '6px');
    await expect(pane.getByRole('button', { name: 'Close Collaboration' })).toHaveCSS(
      'corner-shape',
      'bevel',
    );

    // General Store: a floating label header sits over the top edge
    await applyMood(page, 'general-store');
    await expect(pane).toHaveCSS('corner-shape', 'round');
    await expect(header).toHaveCSS('position', 'absolute');

    // Petal River: an underline header — no header fill, a larger radius
    await applyMood(page, 'petal-river');
    await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(pane).toHaveCSS('border-top-left-radius', '14px');
    await expect(toolbar).toHaveCSS('position', 'static');

    // Back to a bar header: the label leaves, the header paints again
    await applyMood(page, 'navy-dawn');
    await expect(header).toHaveCSS('position', 'static');
    await expect(pane).toHaveCSS('border-top-left-radius', '10px');
  } finally {
    await app.close();
  }
});

test('Raster Bars applies its pixel icons, frames and type; reduced motion stops the pop', async () => {
  const { app, page } = await launchApp();
  try {
    await openWorkspace(page);
    await applyMood(page, 'raster-bars');
    const pane = page.locator('.mosaic-window.pane-collaboration');
    await expect(pane).toHaveCSS('border-top-left-radius', '2px');
    await expect(page.locator('html')).toHaveAttribute('data-icon-set', 'pixel');
    await expect
      .poll(() =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--motion-frames').trim(),
        ),
      )
      .toBe('4');
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--font-display'),
      ),
    ).toContain('Press Start 2P');
    // Raster Bars is quiet (no track of its own): the bar says so, sound stays on
    await expect(page.getByRole('region', { name: 'Mood Bar' })).toContainText('No track');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: test.info().outputPath('raster-bars-workspace.png') });

    // Dialogs pop in under Raster Bars (Motion-driven, stepped in four frames);
    // the OS asking for reduced motion makes the enter instant, and lifting it restores the pop
    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    const dialog = page.locator('[data-motion-role="dialog"]').first();
    await expect(dialog).toHaveAttribute('data-motion-choice', 'pop');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.motionIntensity))
      .toBe('off');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.motionIntensity))
      .toBe('normal');
  } finally {
    await app.close();
  }
});
