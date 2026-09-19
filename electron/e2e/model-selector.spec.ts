import { test, expect, type Page, type ElectronApplication } from '@playwright/test';
import { launchApp } from './launch';

/**
 * The model picker in the Collaboration pane must open *on screen*.
 *
 * It opens upward from a button that moves: expanding the model info panel
 * lifts the control row towards the top of the pane. The menu used to cap its
 * height against the viewport rather than against the room above the button,
 * so with the info panel open its top landed at y=-287 in a 1440x900 window —
 * a third of the list above the edge of the screen.
 *
 * Each case opens the picker and asserts every edge of the menu sits inside
 * the window, with its first option hit-testable where it is drawn.
 */

/** Resize the real BrowserWindow — `page.setViewportSize` is a no-op in Electron. */
async function resize(app: ElectronApplication, width: number, height: number) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      win?.setSize(size.width, size.height);
    },
    { width, height },
  );
}

async function newBlankCrux(page: Page) {
  await page.getByRole('button', { name: /enter/i }).click();
  await page.getByText('Plant a new garden').click();
  await page.getByRole('button', { name: 'Welcome' }).click();
  await page.getByRole('button', { name: 'Add Crux' }).click();
  await page.getByRole('button', { name: /^Blank/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByPlaceholder('Send a message...')).toBeVisible({ timeout: 30_000 });
}

/** Close the picker if it is open. (The menu has no Escape handler.) */
async function closeMenu(page: Page) {
  const menu = page.getByTestId('model-selector-menu');
  if (await menu.isVisible()) {
    await page.getByTestId('model-selector').click();
    await expect(menu).toBeHidden();
  }
}

/** Open the picker and report where the menu landed relative to the window. */
async function openMenu(page: Page) {
  await closeMenu(page);
  await page.getByTestId('model-selector').click();
  const menu = page.getByTestId('model-selector-menu');
  await expect(menu).toBeVisible();
  // The dropdown animates in; measure once it has settled.
  await page.waitForTimeout(400);
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  const view = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  return { menu, box: box!, view };
}

function expectOnScreen(
  box: { x: number; y: number; width: number; height: number },
  view: { width: number; height: number },
  where: string,
) {
  const overflow = {
    top: Math.max(0, -box.y),
    left: Math.max(0, -box.x),
    right: Math.max(0, box.x + box.width - view.width),
    bottom: Math.max(0, box.y + box.height - view.height),
  };
  expect(
    overflow,
    `${where}: menu at ${JSON.stringify(box)} in a ${view.width}x${view.height} window`,
  ).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
}

test.describe('model selector stays on screen', () => {
  test.setTimeout(180_000);

  test('opens inside the window at ordinary and short window heights', async () => {
    const { app, page } = await launchApp();
    try {
      await newBlankCrux(page);

      await resize(app, 1280, 900);
      await page.waitForTimeout(300);
      let opened = await openMenu(page);
      expectOnScreen(opened.box, opened.view, 'tall window');
      // The first option is reachable where it is drawn, not just in the DOM.
      await expect(opened.menu.getByRole('button').first()).toBeVisible();
      await closeMenu(page);

      // A short window is where a viewport-sized menu anchored upward from a
      // button near the bottom has the least room to open into.
      await resize(app, 1280, 560);
      await page.waitForTimeout(300);
      opened = await openMenu(page);
      expectOnScreen(opened.box, opened.view, 'short window');
      await expect(opened.menu.getByRole('button').first()).toBeVisible();
      await closeMenu(page);

      // Narrow: the menu is left-anchored to its button and must not run off
      // the right edge when the Collaboration pane is squeezed.
      await resize(app, 720, 900);
      await page.waitForTimeout(300);
      opened = await openMenu(page);
      expectOnScreen(opened.box, opened.view, 'narrow window');
      await closeMenu(page);

      // The regression: with the model info panel expanded the button sits
      // near the top of the pane, leaving no room to open upward.
      await resize(app, 1440, 900);
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'info' }).click();
      await page.waitForTimeout(400);
      opened = await openMenu(page);
      expectOnScreen(opened.box, opened.view, 'info panel expanded');
      await expect(opened.menu.getByRole('button').first()).toBeVisible();
      // It flips below the button rather than being clipped at the top.
      await expect(opened.menu).toHaveAttribute('data-placement', 'bottom');

      // Still correct in a short window with the panel open.
      await closeMenu(page);
      await resize(app, 1024, 640);
      await page.waitForTimeout(300);
      opened = await openMenu(page);
      expectOnScreen(opened.box, opened.view, 'info panel expanded, short window');
    } finally {
      await app.close();
    }
  });
});
