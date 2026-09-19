import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, switchCrux } from './multi-crux-helpers';

/**
 * Schedules (GARDEN-SCHEDULER-PLAN §2) through the Tending page: a one-off
 * set for ten minutes ago fires the moment it is added and says it was
 * missed; a tool action runs a garden tool on the Crux and reports its
 * result; a cron line reads back in plain words; an "untouched" rule names
 * the Crux; an event trigger fires when a snapshot is taken; everything
 * survives a restart, and a one-off switches itself off after firing.
 */
test('a cron for the garden: time, tool, cron, untouched and event triggers', async () => {
  test.setTimeout(240_000);
  const first = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = first.dir;
  let { app, page } = first;
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  try {
    await enterGarden(page);
    await createCrux(page, 'Ferns');
    await page.locator('header').getByRole('button').first().click();
    await page.locator('header').getByRole('link', { name: 'Tending' }).click();
    const section = page.getByTestId('schedules');
    await expect(section).toContainText('Nothing scheduled');
    const openForm = () => section.getByRole('button', { name: 'Schedule…' }).click();
    const add = () => page.getByRole('button', { name: 'Add', exact: true }).click();
    const bell = page.getByTestId('alerts-bell');
    const menu = page.getByTestId('alerts-menu');
    const done = async (n: number) => {
      if (!(await menu.isVisible())) await bell.click();
      for (let i = 0; i < n; i++) await menu.getByRole('button', { name: 'Done' }).first().click();
      await page.keyboard.press('Escape');
    };

    // 1. A one-off already due, with an alert and a tool action on Ferns.
    await openForm();
    await page.getByLabel('Title', { exact: true }).fill('Water the ferns');
    await page.getByLabel('When', { exact: true }).selectOption('at');
    await page.getByLabel('Time', { exact: true }).fill(local(new Date(Date.now() - 10 * 60_000)));
    await page.getByLabel('Alert note 1').fill('Both pots.');
    await page.getByRole('button', { name: '+ Run a tool' }).click();
    await page.getByLabel('Tool 2').selectOption('list_files');
    await add();
    await expect(section.getByTestId('schedule')).toHaveCount(1);
    await expect(section.getByTestId('schedule')).toContainText('list_files on Ferns');
    await expect(section.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('alerts-count')).toHaveText('2', { timeout: 30_000 });
    await bell.click();
    const reminder = menu.locator('[data-testid="alert"][data-kind="reminder"]');
    await expect(reminder).toContainText('Both pots.');
    await expect(reminder).toContainText('while the app was closed');
    const toolAlert = menu.locator('[data-testid="alert"][data-kind="run"]');
    await expect(toolAlert).toContainText('Water the ferns · list_files');
    // A fresh Crux may not have ingested its first files yet; either answer is the tool's.
    await expect(toolAlert).toContainText(/No files yet|AGENTS\.md|CLAUDE\.md/);
    await page.keyboard.press('Escape');
    await done(2);

    // 2. A cron line reads back in words and shows its next time.
    await openForm();
    await page.getByLabel('Title', { exact: true }).fill('Weekday stand-up');
    await page.getByLabel('When', { exact: true }).selectOption('cron');
    await page.getByLabel('Cron', { exact: true }).fill('30 9 * * mon-fri');
    await expect(page.getByTestId('cron-reading')).toContainText('weekdays at 09:30');
    await page.getByLabel('Cron', { exact: true }).fill('nonsense');
    await expect(page.getByTestId('cron-reading')).toContainText('five fields');
    await page.getByLabel('Cron', { exact: true }).fill('30 9 * * mon-fri');
    await add();
    await expect(section.getByTestId('schedule')).toHaveCount(2);
    await expect(
      section.getByTestId('schedule').filter({ hasText: 'Weekday stand-up' }),
    ).toContainText(/weekdays at 09:30 · next/);

    // 3. Untouched for zero days names the Crux.
    await openForm();
    await page.getByLabel('Title', { exact: true }).fill('Still growing?');
    await page.getByLabel('When', { exact: true }).selectOption('untouched');
    await page.getByLabel('After', { exact: true }).fill('0');
    await add();
    await expect(section.getByTestId('schedule')).toHaveCount(3);
    await expect(page.getByTestId('alerts-count')).toHaveText('1');
    await bell.click();
    await expect(menu.getByTestId('alert')).toContainText('Ferns: not touched today');
    await page.keyboard.press('Escape');
    await done(1);

    // 4. An event trigger: when a snapshot is taken in Ferns, play a cue and alert.
    await openForm();
    await page.getByLabel('Title', { exact: true }).fill('Snapshot taken');
    await page.getByLabel('When', { exact: true }).selectOption('event');
    await page.getByLabel('Event', { exact: true }).selectOption('snapshot');
    await page.getByLabel('Crux', { exact: true }).selectOption({ label: 'Ferns' });
    await page.getByRole('button', { name: '+ Play a cue' }).click();
    await page.getByLabel('Cue 2').selectOption('ripple');
    await add();
    await expect(section.getByTestId('schedule')).toHaveCount(4);
    await expect(page.getByTestId('alerts-count')).toHaveCount(0);
    // Take a snapshot in Ferns: the mock turn writes a file and snapshots.
    await switchCrux(page, 'Ferns');
    const input = page.getByPlaceholder('Send a message...');
    await input.fill('Please write hello');
    await input.press('Enter');
    await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('alerts-count')).toHaveText('1', { timeout: 30_000 });
    await bell.click();
    await expect(menu.getByTestId('alert')).toContainText('Snapshot taken');
    await page.keyboard.press('Escape');

    // 5. Restart: the schedules are the garden's; Remove works.
    await app.close();
    ({ app, page } = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } }));
    await page.getByRole('button', { name: /enter/i }).click();
    await page.locator('header').getByRole('link', { name: 'Tending' }).click();
    await expect(page.getByTestId('schedules').getByTestId('schedule')).toHaveCount(4);
    await page.getByRole('button', { name: 'Remove schedule Still growing?' }).click();
    await expect(page.getByTestId('schedules').getByTestId('schedule')).toHaveCount(3);
  } finally {
    await app.close();
  }
});
