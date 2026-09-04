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

// Inspect painted pane chrome, not just the tokens stored on <html>.
test('Moods change pane borders, corners, and header geometry without reopening the Crux', async () => {
  const { app, page } = await launchApp();
  try {
    await openWorkspace(page);
    const pane = page.locator('.mosaic-window.pane-collaboration');
    const header = pane.locator('.pane-toolbar');
    const body = pane.locator(':scope > .mosaic-window-body');
    await page.getByRole('button', { name: 'Toggle metadata' }).click();
    const divider = page.locator('.mosaic-window.pane-details .divider').first();

    await applyMood(page, 'windows-95');
    await expect(pane).toHaveCSS('border-top-style', 'outset');
    await expect(pane).toHaveCSS('border-top-width', '3px');
    await expect(pane).toHaveCSS('border-top-color', 'rgb(192, 192, 192)');
    await expect(pane).toHaveCSS('corner-shape', 'square');

    await applyMood(page, 'sunday-paper');
    await expect(pane).toHaveCSS('border-top-style', 'double');
    await expect(pane).toHaveCSS('border-top-width', '3px');
    await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(header).toHaveCSS('border-bottom-style', 'double');
    await expect(header).toHaveCSS('border-bottom-width', '3px');
    await expect(divider).toHaveCSS('border-top-style', 'double');
    await expect(divider).toHaveCSS('border-top-width', '3px');

    await applyMood(page, 'terminal');
    await expect(pane).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(body).toHaveCSS('border-top-style', 'solid');
    await expect(header).toHaveCSS('border-bottom-width', '0px');
    await expect
      .poll(async () => {
        const h = (await header.boundingBox())!;
        const b = (await body.boundingBox())!;
        return h.width < b.width - 20 && h.y < b.y && Math.abs(h.y + h.height - b.y - 1) < 1;
      })
      .toBe(true);

    await applyMood(page, 'blade-runner-rain');
    await expect(pane).toHaveCSS('corner-shape', 'notch');
    await expect(pane).toHaveCSS('border-top-left-radius', '12px');
    await expect(pane).toHaveCSS('background-image', /linear-gradient/);
    await expect(pane.getByRole('button', { name: 'Close Collaboration' })).toHaveCSS(
      'corner-shape',
      'bevel',
    );

    await applyMood(page, 'solarpunk-garden');
    await expect(pane).toHaveCSS('corner-shape', 'bevel');
    await expect(header).toHaveCSS('position', 'absolute');
    await expect(divider).toHaveCSS('border-top-width', '0px');
    expect(await divider.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"✦"');
    await expect
      .poll(async () => {
        const h = (await header.boundingBox())!;
        const b = (await body.boundingBox())!;
        return h.width < b.width - 20 && h.y < b.y;
      })
      .toBe(true);

    await applyMood(page, 'pretty-in-pink');
    await expect(pane).toHaveCSS('corner-shape', 'scoop');

    // Switching away removes the split frame and the floating header too.
    await applyMood(page, 'plain-form');
    await expect(pane).toHaveCSS('corner-shape', 'square');
    await expect(header).toHaveCSS('position', 'static');
    await expect(body).toHaveCSS('border-top-width', '0px');
  } finally {
    await app.close();
  }
});

test('Spring Morning gives the body the header space and reveals controls on hover or keyboard focus', async () => {
  const { app, page } = await launchApp();
  try {
    await openWorkspace(page);
    await applyMood(page, 'spring-morning');
    const pane = page.locator('.mosaic-window.pane-collaboration');
    const toolbar = pane.locator(':scope > .mosaic-window-toolbar');
    const body = pane.locator(':scope > .mosaic-window-body');
    const close = pane.getByRole('button', { name: 'Close Collaboration' });
    await expect(toolbar).toHaveCSS('position', 'absolute');
    await expect(toolbar).toHaveCSS('opacity', '0');
    await expect
      .poll(async () => (await body.boundingBox())!.y - (await pane.boundingBox())!.y)
      .toBeLessThan(3);
    await body.hover();
    await expect(toolbar).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: 'Mood', exact: true }).hover();
    await expect(toolbar).toHaveCSS('opacity', '0');
    await close.focus();
    await expect(toolbar).toHaveCSS('opacity', '1');
    await close.press('Enter');
    await expect(pane).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('GeoCities applies its stars, bevels, pixel icons and MIDI-style Mix; reduced motion stops the pop', async () => {
  const { app, page } = await launchApp();
  try {
    await openWorkspace(page);
    await applyMood(page, 'geocities');
    const pane = page.locator('.mosaic-window.pane-collaboration');
    await expect(pane).toHaveCSS('border-top-style', 'outset');
    await expect(pane).toHaveCSS('border-top-width', '4px');
    await expect(page.locator('html')).toHaveAttribute('data-icon-set', 'pixel');
    await expect(page.locator('.mood-texture')).toHaveCSS('background-image', /radial-gradient/);
    await expect(page.locator('.mood-texture')).toHaveCSS(
      'background-size',
      '72px 72px, 72px 72px, 72px 72px',
    );
    await expect(page.getByRole('region', { name: 'Mood Bar' })).toContainText('Webring Radio');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: test.info().outputPath('geocities-workspace.png') });

    await page.getByRole('button', { name: 'Mood', exact: true }).click();
    const dialog = page.locator('.motion-enter-dialog').first();
    await expect(dialog).toHaveCSS('animation-name', 'motion-in-pop');
    await expect(page.getByTestId('bundled-geocities')).toHaveCSS('border-top-style', 'double');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(dialog).toHaveCSS('animation-duration', '0s');
    // The stored Mood stays expressive when the system preference is lifted.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(dialog).toHaveCSS('animation-duration', '0.18s');
  } finally {
    await app.close();
  }
});
