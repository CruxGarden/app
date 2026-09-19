import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * Docked mode (GARDEN-SCHEDULER-PLAN): with the switch on, closing the
 * window hides it and the app lives on — the window still exists, its page
 * still runs, a schedule still fires — until Quit. With the switch off,
 * closing the window is the ordinary close. The tray itself cannot be
 * clicked from here; its Open is the same call `activate` makes.
 */
test('closing the window in docked mode keeps the garden running', async () => {
  test.setTimeout(300_000);
  const { app, page } = await launchApp();
  const windowState = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { count: BrowserWindow.getAllWindows().length, visible: w ? w.isVisible() : false };
    });
  try {
    await enterGarden(page);

    // Off: the close request goes the ordinary way (the close guard asks).
    await page.keyboard.press('ControlOrMeta+,');
    const toggle = page.getByRole('switch', {
      name: 'Keep running in the menu bar when the window closes',
    });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // A schedule for a minute from now, so something has to happen while hidden.
    await page.locator('header').getByRole('link', { name: 'Tending' }).click();
    await page.getByTestId('schedules').getByRole('button', { name: 'Schedule…' }).click();
    await page.getByLabel('Title', { exact: true }).fill('While hidden');
    await page.getByLabel('When', { exact: true }).selectOption('every');
    await page.getByLabel('Every', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByTestId('schedules').getByTestId('schedule')).toHaveCount(1);

    // Close the window the way the red button does.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await expect.poll(windowState).toEqual({ count: 1, visible: false });

    // Still running: the page answers, and the timer fires while hidden.
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete');
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                window as unknown as { __cruxAlerts?: { count: () => number } }
              ).__cruxAlerts?.count() ?? -1,
          ),
        { timeout: 150_000 },
      )
      .toBeGreaterThanOrEqual(1);

    // Open again: what the tray's Open and a dock click do.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.show());
    await expect.poll(windowState).toEqual({ count: 1, visible: true });
    await expect(page.getByTestId('alerts-count')).toHaveText('1');
  } finally {
    await app.close();
  }
});
