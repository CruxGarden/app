import { test, expect, type Page, type Locator } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome, switchCrux, storedCrux } from '../multi-crux-helpers';
import { showPane, togglePanel } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 19 · Tending and alerts. The scripted collaborator
 * (CRUX_AI_MOCK) holds a `[workspace:X]` turn for twelve seconds before it
 * writes shared.txt, and `[workspace:X:delete]` asks before deleting it —
 * long enough to look at Tending while work runs, and a real approval to
 * answer. TEND-07 (OS notification permission) is manual.
 */
const MOCK = { env: { CRUX_AI_MOCK: '1' } };

async function newTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Task name', exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save and start task' }).click();
  await expect(page.getByRole('dialog', { name: 'New task', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
  return (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
}

async function send(page: Page, text: string) {
  const input = page.getByPlaceholder('Send a message...');
  await input.fill(text);
  await input.press('Enter');
}

/** The sr-only summary line: "N tasks need tending. M working." */
const summary = (tending: Locator) => tending.getByText(/^\d+ tasks need tending\. \d+ working\.$/);
const group = (tending: Locator, title: string) =>
  tending.getByRole('region', { name: title, exact: true });
const row = (tending: Locator, crux: string, title: string) =>
  group(tending, crux)
    .locator('[data-testid^="tending-row-"]')
    .filter({ has: tending.page().getByRole('heading', { name: title, exact: true, level: 3 }) });

/**
 * Two Cruxes; a Task "Side" in Alpha and Main in Beta both running a held
 * turn, Beta with a follow-up queued. Ends in Beta's workspace.
 */
async function startWork(page: Page, planted?: { alpha: string; beta: string }) {
  const alpha = planted?.alpha ?? (await createCrux(page, 'Alpha'));
  const beta = planted?.beta ?? (await createCrux(page, 'Beta'));
  await switchCrux(page, 'Alpha');
  const side = await newTask(page, 'Side');
  await send(page, '[workspace:Side]');
  await expect(page.getByTestId('turn-job')).toBeVisible();
  await switchCrux(page, 'Beta');
  await send(page, '[workspace:Beta]');
  await expect(page.getByTestId('turn-job')).toBeVisible();
  await send(page, 'Queued for Beta');
  return { alpha, beta, side };
}

/** The Project Folder of a Task's Working Copy. */
const copyFolder = (page: Page, id: string) =>
  page.evaluate(
    async (id) =>
      (
        (await window.electronAPI!.sqlite.get(
          'SELECT project_folder FROM working_copies WHERE id = ?',
          [id],
        )) as { project_folder: string }
      ).project_folder,
    id,
  );

test.describe('guide 19 · Tending', () => {
  test('TEND-01 — idle and running work: labels, counts and Crux/Task groups match what runs', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      const alpha = await createCrux(page, 'Alpha');
      const beta = await createCrux(page, 'Beta');
      // Idle: under All both Cruxes are listed, nothing works, nothing needs tending.
      let tending = await showPane(page, 'Tending');
      await tending.getByLabel('Show tasks').selectOption('all');
      await expect(summary(tending)).toHaveText('0 tasks need tending. 0 working.');
      await expect(row(tending, 'Alpha', 'Main')).toContainText('Idle');
      await expect(row(tending, 'Beta', 'Main')).toContainText('Idle');
      await page.locator('.mosaic-window.pane-tending .pane-toolbar-close').click();
      // Work: the Task in Alpha and Main in Beta run; Alpha's Main stays idle.
      await startWork(page, { alpha, beta });
      tending = await showPane(page, 'Tending');
      await tending.getByLabel('Show tasks').selectOption('all');
      await expect(summary(tending)).toHaveText('0 tasks need tending. 2 working.');
      await expect(row(tending, 'Alpha', 'Side')).toContainText('Working');
      await expect(row(tending, 'Alpha', 'Main')).toContainText('Idle');
      await expect(row(tending, 'Beta', 'Main')).toContainText('Working');
      await expect(row(tending, 'Beta', 'Main')).toContainText('1 queued');
      // Current work keeps what runs in view.
      await tending.getByLabel('Show tasks').selectOption('current');
      await expect(row(tending, 'Alpha', 'Side')).toBeVisible();
      await expect(row(tending, 'Beta', 'Main')).toBeVisible();
      // When the turns finish, the counts come down with them.
      await expect(summary(tending)).toHaveText(/ 0 working\.$/, { timeout: 60_000 });
    } finally {
      await app.close();
    }
  });

  test('TEND-03 — Stop from Tending stops only that Task; the other keeps its turn and its queue', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      const { beta, side } = await startWork(page);
      const tending = await showPane(page, 'Tending');
      await tending.getByLabel('Show tasks').selectOption('all');
      await expect(summary(tending)).toHaveText('0 tasks need tending. 2 working.');
      await row(tending, 'Alpha', 'Side').getByRole('button', { name: 'Stop Side' }).click();
      await page.getByRole('button', { name: 'Stop task', exact: true }).click();
      await expect(row(tending, 'Alpha', 'Side')).toContainText('Work was interrupted');
      await expect(row(tending, 'Beta', 'Main')).toContainText('Working');
      // Beta finishes its turn and then its queued follow-up.
      await expect(page.getByText('Completed workspace Beta.', { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText('Mock reply: Queued for Beta', { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      const betaFolder = (await storedCrux(page, beta)).projectFolder as string;
      expect(readFileSync(join(betaFolder, 'shared.txt'), 'utf8')).toBe('Owned by Beta\n');
      // The stopped Task never wrote its file.
      expect(existsSync(join(await copyFolder(page, side), 'shared.txt'))).toBe(false);
    } finally {
      await app.close();
    }
  });

  test('TEND-04 — an approval behind a hidden pane: Answer from Tending and Open from the bell reveal the request; answering resolves its alert', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      await createCrux(page, 'Alpha');
      await send(page, '[workspace:Alpha]');
      await expect(page.getByText('Completed workspace Alpha.', { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      const collaboration = page.getByTestId('pane-body-collaboration');
      const request = page.locator('[data-tending-request]');
      const bell = page.getByTestId('alerts-bell');
      const count = page.getByTestId('alerts-count');

      // 1. From Tending. The request arrives while its pane is hidden.
      await send(page, '[workspace:Alpha:delete]');
      await togglePanel(page, 'Toggle collaboration');
      await expect(collaboration).toHaveCount(0);
      await goHome(page);
      const tending = await showPane(page, 'Tending');
      const main = row(tending, 'Alpha', 'Main');
      await expect(main).toContainText('Needs approval', { timeout: 30_000 });
      await expect(count).toHaveText('1');
      await expect(main).toContainText('Open workspace');
      await main.getByRole('button', { name: 'Answer Main' }).click();
      await expect(
        page,
        await tending
          .getByRole('alert')
          .allTextContents()
          .then((t) => t.join(' | ')),
      ).toHaveURL(/\/c\//, { timeout: 30_000 });
      await expect(collaboration).toBeVisible({ timeout: 30_000 });
      await expect(request).toContainText('Delete shared.txt?');
      await expect(request).toBeInViewport();
      await request.getByRole('button', { name: 'Keep' }).click();
      await expect(request).toHaveCount(0);
      await expect(count).toHaveCount(0);
      await expect(
        page.getByText('Completed workspace Alpha.', { exact: true }).nth(1),
      ).toBeVisible({ timeout: 60_000 });

      // 2. From the bell, again with the pane hidden.
      await send(page, '[workspace:Alpha:delete]');
      await togglePanel(page, 'Toggle collaboration');
      await expect(collaboration).toHaveCount(0);
      await goHome(page);
      await expect(count).toHaveText('1', { timeout: 60_000 });
      await bell.click();
      const alert = page
        .getByTestId('alerts-menu')
        .locator('[data-testid="alert"][data-kind="tending"]');
      await expect(alert).toContainText('Alpha · Main');
      await alert.getByRole('button', { name: 'Open' }).click();
      await expect(collaboration).toBeVisible({ timeout: 30_000 });
      await expect(request).toContainText('Delete shared.txt?');
      await request.getByRole('button', { name: 'Keep' }).click();
      await expect(request).toHaveCount(0);
      await expect(count).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('TEND-05 — a resolved request withdraws its notification; a newer request has its own and is not answered by the old one', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp(MOCK);
    try {
      await enterGarden(page);
      const alpha = await createCrux(page, 'Alpha');
      await send(page, '[workspace:Alpha]');
      await expect(page.getByText('Completed workspace Alpha.', { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      const folder = (await storedCrux(page, alpha)).projectFolder as string;
      const request = page.locator('[data-tending-request]');
      const count = page.getByTestId('alerts-count');
      const menu = page.getByTestId('alerts-menu');
      // The first request and its notification.
      await send(page, '[workspace:Alpha:delete]');
      await expect(request).toBeVisible({ timeout: 60_000 });
      await expect(count).toHaveText('1', { timeout: 60_000 });
      await page.getByTestId('alerts-bell').click();
      await expect(menu.getByTestId('alert')).toContainText('Alpha · Main');
      await page.keyboard.press('Escape');
      // Resolved in the pane: the old notification is withdrawn, not left to click.
      await request.getByRole('button', { name: 'Keep' }).click();
      await expect(request).toHaveCount(0);
      await expect(count).toHaveCount(0);
      await page.getByTestId('alerts-bell').click();
      await expect(menu).toContainText('Nothing needs you right now');
      await page.keyboard.press('Escape');
      await expect(
        page.getByText('Completed workspace Alpha.', { exact: true }).nth(1),
      ).toBeVisible({ timeout: 60_000 });
      // A newer request: its own notification, which reveals it and answers nothing.
      await send(page, '[workspace:Alpha:delete]');
      await expect(request).toBeVisible({ timeout: 60_000 });
      await expect(count).toHaveText('1', { timeout: 60_000 });
      await page.getByTestId('alerts-bell').click();
      await menu.getByTestId('alert').getByRole('button', { name: 'Open' }).click();
      await expect(request).toContainText('Delete shared.txt?');
      await expect(request).toBeInViewport();
      expect(existsSync(join(folder, 'shared.txt'))).toBe(true);
      await request.getByRole('button', { name: 'Keep' }).click();
      await expect(request).toHaveCount(0);
      await expect(count).toHaveCount(0);
      expect(existsSync(join(folder, 'shared.txt'))).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('TEND-06 — alerts from two Cruxes: Open lands in the right one, Done and Later keep the count right, and Later comes back after a restart', async () => {
    test.setTimeout(150_000);
    let launch = await launchApp();
    const dir = launch.dir;
    try {
      let { page } = launch;
      await enterGarden(page);
      await createCrux(page, 'Fern');
      await createCrux(page, 'Moss');
      await goHome(page);
      const tending = await showPane(page, 'Tending');
      const section = tending.getByTestId('schedules');
      // One nudge per Crux, both due now.
      for (const crux of ['Fern', 'Moss']) {
        await section.getByRole('button', { name: 'Schedule…' }).click();
        await page.getByLabel('Title', { exact: true }).fill(`Nudge ${crux}`);
        await page.getByLabel('When', { exact: true }).selectOption('untouched');
        await page.getByLabel('After', { exact: true }).fill('0');
        await page.getByLabel('Crux', { exact: true }).selectOption({ label: crux });
        await page.getByRole('button', { name: 'Add', exact: true }).click();
      }
      await expect(section.getByTestId('schedule')).toHaveCount(2);
      const count = page.getByTestId('alerts-count');
      const bell = page.getByTestId('alerts-bell');
      const menu = page.getByTestId('alerts-menu');
      await expect(count).toHaveText('2', { timeout: 30_000 });
      await bell.click();
      const alert = (crux: string) =>
        menu.getByTestId('alert').filter({ hasText: `Nudge ${crux}` });
      await expect(alert('Fern')).toContainText('Fern: not touched today');
      await expect(alert('Moss')).toContainText('Moss: not touched today');
      // Open goes to that Crux; the alert stays until it is put away.
      await alert('Fern').getByRole('button', { name: 'Open' }).click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Fern',
      );
      await expect(count).toHaveText('2');
      // Later puts Fern's away until the next launch; Done finishes Moss's.
      await bell.click();
      await alert('Fern').getByRole('button', { name: 'Later' }).click();
      await expect(count).toHaveText('1');
      await alert('Moss').getByRole('button', { name: 'Done' }).click();
      await expect(count).toHaveCount(0);
      await expect(menu).toContainText('nothing new');
      await page.keyboard.press('Escape');
      // The nudges have done their work for today; remove them before the restart.
      await goHome(page);
      for (const crux of ['Fern', 'Moss'])
        await page.getByRole('button', { name: `Remove schedule Nudge ${crux}` }).click();
      await expect(section.getByTestId('schedule')).toHaveCount(0);
      await launch.app.close();

      launch = await launchApp({ dir });
      page = launch.page;
      await page.getByRole('button', { name: 'Enter', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
      // Fern's alert is back, Moss's is not, and Open still lands in Fern.
      await expect(page.getByTestId('alerts-count')).toHaveText('1', { timeout: 30_000 });
      await page.getByTestId('alerts-bell').click();
      const back = page.getByTestId('alerts-menu').getByTestId('alert');
      await expect(back).toHaveCount(1);
      await expect(back).toContainText('Nudge Fern');
      await back.getByRole('button', { name: 'Open' }).click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Fern',
        { timeout: 30_000 },
      );
    } finally {
      await launch.app.close();
    }
  });

  test('TEND-02 — search narrows the list, the filter changes it, clearing restores it, a result opens its Crux', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Fern notes');
      await createCrux(page, 'Moss study');
      await goHome(page);
      const tending = await showPane(page, 'Tending');
      // Quiet Cruxes are not "current work": All shows them.
      const filter = tending.getByLabel('Show tasks');
      await filter.selectOption('all');
      // Each Crux is a group named after it; its Main lane has the Open button.
      const group = (title: string) => tending.getByRole('region', { name: title, exact: true });
      await expect(group('Fern notes')).toBeVisible();
      await expect(group('Moss study')).toBeVisible();
      const search = tending.getByLabel('Search Tending');
      await search.fill('moss');
      await expect(group('Moss study')).toBeVisible();
      await expect(group('Fern notes')).toHaveCount(0);
      await search.fill('nothing like this');
      await expect(tending.getByRole('button', { name: /^Open / })).toHaveCount(0);
      await search.fill('');
      await expect(group('Fern notes')).toBeVisible();
      // The filter: nothing needs tending in a quiet garden; All shows both.
      await filter.selectOption('attention');
      await expect(tending.getByRole('button', { name: /^Open / })).toHaveCount(0);
      await filter.selectOption('all');
      await expect(group('Moss study')).toBeVisible();
      // A result opens the right Crux.
      await group('Moss study')
        .getByRole('button', { name: /^Open / })
        .first()
        .click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Moss study',
      );
    } finally {
      await app.close();
    }
  });

  test('TEND-08 — Tending opens as a pane from Home, from inside a Crux, from a timer chip and from an alert', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      // From Home: the top-bar link.
      await page.locator('header').getByRole('button', { name: 'Tending', exact: true }).click();
      await expect(page.getByTestId('pane-body-tending')).toBeVisible();
      await expect(page.locator('.mosaic-window.pane-tending')).toBeVisible();
      // A timer makes a chip; an alert rings the bell. Both lead here.
      const section = page.getByTestId('schedules');
      await section.getByRole('button', { name: 'Schedule…' }).click();
      await page.getByLabel('Title', { exact: true }).fill('Focus');
      await page.getByLabel('When', { exact: true }).selectOption('timer');
      await page.getByLabel('Alert note 1').fill('Break time.');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await section.getByRole('button', { name: 'Start', exact: true }).click();
      await expect(page.getByTestId('timer-chip').first()).toBeVisible({ timeout: 30_000 });
      await page.locator('.mosaic-window.pane-tending .pane-toolbar-close').click();
      await expect(page.getByTestId('pane-body-tending')).toHaveCount(0);
      await page.getByTestId('timer-chip').first().getByRole('button').first().click();
      await expect(page.getByTestId('pane-body-tending')).toBeVisible({ timeout: 30_000 });
      await page.locator('.mosaic-window.pane-tending .pane-toolbar-close').click();
      // Inside a Crux: the same link, the same pane, beside the work.
      await createCrux(page, 'Inside');
      await page.locator('header').getByRole('button', { name: 'Tending', exact: true }).click();
      await expect(page.getByTestId('pane-body-tending')).toBeVisible();
      await expect(page.getByTestId('pane-body-collaboration')).toBeVisible();
      // It lists Cruxes, never Gardens or Moods.
      const tending = page.getByTestId('pane-body-tending');
      await tending.getByLabel('Show tasks').selectOption('all');
      await expect(tending.getByRole('region', { name: 'Inside', exact: true })).toBeVisible();
      await expect(tending.getByRole('region', { name: 'My Garden', exact: true })).toHaveCount(0);
      await expect(tending.getByRole('region', { name: /Digital Fractal Garden/ })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
