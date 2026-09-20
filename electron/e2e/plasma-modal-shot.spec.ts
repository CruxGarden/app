import { test } from '@playwright/test';
import { launchApp } from './launch';
import { createCrux, enterGarden } from './multi-crux-helpers';

/**
 * Evidence, not a gate: a dialog under the Plasma theme, drawn by its own
 * overlay canvas above the scrim. Shots land in CRUX_TOUR_SHOTS.
 */
const SHOTS = process.env.CRUX_TOUR_SHOTS ?? 'e2e/.results/tour';
test('plasma modal shot', async () => {
  test.setTimeout(180_000);
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await enterGarden(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    // Mid-form: the material is still arriving and the contents wait for it.
    await page.waitForTimeout(140);
    await page.screenshot({ path: `${SHOTS}/plasma-modal-forming.png` });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/plasma-modal-add-crux.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/plasma-home.png` });
    // The plasma button, at rest and under the pointer (the swirl fills it).
    const plant = page.getByRole('button', { name: 'Plant your first crux' });
    await plant.hover();
    await page.waitForTimeout(700);
    const box = (await plant.boundingBox())!;
    await page.screenshot({
      path: `${SHOTS}/plasma-button-hover.png`,
      clip: { x: box.x - 120, y: box.y - 80, width: box.width + 240, height: box.height + 160 },
    });
    await page.mouse.move(10, 500);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${SHOTS}/plasma-button-rest.png`,
      clip: { x: box.x - 120, y: box.y - 80, width: box.width + 240, height: box.height + 160 },
    });
    // The account menu grown out of the top bar.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/plasma-menu.png` });
    await page.screenshot({
      path: `${SHOTS}/plasma-menu-close.png`,
      clip: { x: 900, y: 0, width: 500, height: 320 },
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    // The alerts inbox, grown out of the bar too.
    await page.getByTestId('alerts-bell').click();
    await page.waitForTimeout(700);
    await page.screenshot({
      path: `${SHOTS}/plasma-menu-bell.png`,
      clip: { x: 0, y: 0, width: 700, height: 400 },
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.keyboard.press('ControlOrMeta+,');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/plasma-modal-settings.png` });
    await page.keyboard.press('Escape');
    await createCrux(page, 'Material');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/plasma-builder.png` });
    // Menus raised on a pane: the model picker, and a right-click menu in Artifacts.
    await page.getByTestId('model-selector').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/plasma-menu-picker.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const artifacts = page.getByTestId('pane-body-artifacts');
    if (!(await artifacts.isVisible()))
      await page.getByRole('button', { name: 'Toggle artifacts' }).click();
    await artifacts.waitFor();
    await page.waitForTimeout(800);
    await artifacts.click({ button: 'right', position: { x: 120, y: 120 } });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/plasma-menu-context.png` });
    await page.keyboard.press('Escape');
    // The crux card's actions, raised on the card.
    await page.locator('header').getByRole('button').first().click();
    await page.getByRole('button', { name: 'Add Crux' }).waitFor();
    await page.getByRole('button', { name: 'Open Material' }).hover();
    await page.getByRole('button', { name: 'Crux actions' }).first().click();
    await page.getByRole('menu').waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/plasma-menu-card.png` });
  } finally {
    await app.close();
  }
});
