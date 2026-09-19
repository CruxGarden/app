import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

/**
 * Schedules (GARDEN-SCHEDULER-PLAN §2) through the Tending page: a reminder
 * set for a minute ago is already due, so it arrives as an alert the moment
 * it is added and says it was missed; a nudge for "0 days untouched" names
 * the Crux; schedules survive a restart and a one-off switches itself off
 * after firing.
 */
test('a reminder and a nudge arrive as alerts', async () => {
  test.setTimeout(180_000);
  const first = await launchApp();
  const dir = first.dir;
  let { app, page } = first;
  try {
    await enterGarden(page);
    await createCrux(page, 'Ferns');
    await page.locator('header').getByRole('button').first().click();
    await page.locator('header').getByRole('link', { name: 'Tending' }).click();
    const section = page.getByTestId('schedules');
    await expect(section).toContainText('Nothing scheduled');

    // A reminder already due.
    await section.getByRole('button', { name: 'Schedule…' }).click();
    await page.getByLabel('Title', { exact: true }).fill('Water the ferns');
    await page.getByLabel('Note', { exact: true }).fill('Both pots.');
    const ago = new Date(Date.now() - 10 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    await page
      .getByLabel('When', { exact: true })
      .fill(
        `${ago.getFullYear()}-${pad(ago.getMonth() + 1)}-${pad(ago.getDate())}T${pad(ago.getHours())}:${pad(ago.getMinutes())}`,
      );
    await page.getByLabel('Crux', { exact: true }).selectOption({ label: 'Ferns' });
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(section.getByTestId('schedule')).toHaveCount(1);
    await expect(section.getByTestId('schedule')).toContainText('Ferns');
    // It fired at once, and switched itself off.
    await expect(page.getByTestId('alerts-count')).toHaveText('1');
    await expect(section.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('alerts-bell').click();
    const alert = page.getByTestId('alerts-menu').getByTestId('alert');
    await expect(alert).toContainText('Water the ferns');
    await expect(alert).toContainText('Both pots. About Ferns.');
    await expect(alert).toContainText('while the app was closed');
    await expect(alert).toHaveAttribute('data-kind', 'reminder');
    await alert.getByRole('button', { name: 'Done' }).click();
    await page.keyboard.press('Escape');

    // A nudge about anything untouched today.
    await section.getByRole('button', { name: 'Schedule…' }).click();
    await page.getByLabel('Kind', { exact: true }).selectOption('nudge');
    await page.getByLabel('Title', { exact: true }).fill('Still growing?');
    await page.getByLabel('After', { exact: true }).fill('0');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(section.getByTestId('schedule')).toHaveCount(2);
    await expect(page.getByTestId('alerts-count')).toHaveText('1');
    await page.getByTestId('alerts-bell').click();
    const nudge = page.getByTestId('alerts-menu').getByTestId('alert');
    await expect(nudge).toContainText('Ferns · Still growing?');
    await expect(nudge).toHaveAttribute('data-kind', 'nudge');
    await page.keyboard.press('Escape');

    // Restart: the schedules are the garden's.
    await app.close();
    ({ app, page } = await launchApp({ dir }));
    await page.getByRole('button', { name: /enter/i }).click();
    await page.locator('header').getByRole('link', { name: 'Tending' }).click();
    await expect(page.getByTestId('schedules').getByTestId('schedule')).toHaveCount(2);
    await page.getByRole('button', { name: 'Remove schedule Still growing?' }).click();
    await expect(page.getByTestId('schedules').getByTestId('schedule')).toHaveCount(1);
  } finally {
    await app.close();
  }
});
