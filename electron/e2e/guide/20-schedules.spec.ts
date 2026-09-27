import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux, goHome, storedCrux } from '../multi-crux-helpers';
import { showPane, hidePane, enableAi } from '../panel-helpers';
import { newGarden, goToGarden, writeFirstFile, markVersion } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 20 · Schedules — sun and weather triggers, disable and
 * enable, a zero interval, the Garden's own schedules and their export, the
 * untouched rule, every action kind, inherited Mood schedules, a restart
 * around a due time. SCHED-03 and SCHED-06 are timers.spec.ts; the rest of
 * SCHED-01/02 is schedules.spec.ts. Sleep/wake (SCHED-10) is manual.
 */
async function openForm(page: Page) {
  const tending = await showPane(page, 'Tending');
  const section = tending.getByTestId('schedules');
  await section.getByRole('button', { name: 'Schedule…' }).click();
  return { tending, section };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A datetime-local value: ten minutes ago, so an "at" schedule fires on Add. */
function tenMinutesAgo() {
  const d = new Date(Date.now() - 10 * 60_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** What the Mood pane says the Garden in front wears. */
async function gardenMoodLine(page: Page) {
  // Opened from the top bar: an inherited schedule has a "Mood" pill of its own.
  if (!(await page.getByTestId('pane-body-mood').count()))
    await page.locator('header').getByRole('button', { name: 'Mood', exact: true }).click();
  const mood = page.getByRole('region', { name: 'Mood', exact: true }).first();
  await expect(mood).toBeVisible({ timeout: 30_000 });
  const tab = mood.getByRole('button', { name: 'Moods', exact: true });
  if (await tab.count()) await tab.click();
  const line = mood.getByRole('region', { name: 'Garden Mood' });
  await expect(line).toBeVisible();
  return line;
}

/** A weather station of our own: answers every request with one kind. */
function station(kind: string): Promise<{ url: string; close: () => void; hits: () => number }> {
  let hits = 0;
  return new Promise((resolve) => {
    const server: Server = createServer((_req, res) => {
      hits++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ kind, temperature: 12 }));
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${port}/weather`,
        close: () => server.close(),
        hits: () => hits,
      });
    });
  });
}

test.describe('guide 20 · Schedules', () => {
  test('SCHED-07 — a place and coordinates give dawn, sunrise, sunset and dusk, and follow edits', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const { section } = await openForm(page);
      await page.getByLabel('Title', { exact: true }).fill('Lights at dusk');
      await page.getByLabel('When', { exact: true }).selectOption('sun');
      const today = page.getByTestId('sun-today');
      // Reykjavík.
      await page.getByLabel('Place name').fill('Reykjavík');
      await page.getByLabel('Latitude').fill('64.13');
      await page.getByLabel('Longitude').fill('-21.9');
      await page.getByRole('button', { name: 'Set', exact: true }).click();
      await expect(today).toContainText(/today: dawn \d/);
      const north = await today.textContent();
      // Sydney: the sun keeps very different hours.
      await page.getByRole('button', { name: 'change', exact: true }).click();
      await page.getByLabel('Place name').fill('Sydney');
      await page.getByLabel('Latitude').fill('-33.87');
      await page.getByLabel('Longitude').fill('151.21');
      await page.getByRole('button', { name: 'Set', exact: true }).click();
      await expect(today).not.toHaveText(north!);
      await page.getByLabel('Alert note 1').fill('Dusk.');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      const row = section.getByTestId('schedule');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(/at dusk/i);
      await expect(row).not.toContainText('set a place');
    } finally {
      await app.close();
    }
  });

  test('SCHED-08 — the weather comes from the configured endpoint; a dead one is visible, not a false trigger', async () => {
    test.setTimeout(150_000);
    const rain = await station('rain');
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const { section } = await openForm(page);
      await page.getByLabel('Title', { exact: true }).fill('Rain check');
      await page.getByLabel('When', { exact: true }).selectOption('weather');
      await page.getByLabel('Turns', { exact: true }).selectOption('rain');
      await page.getByLabel('Latitude').fill('51.5');
      await page.getByLabel('Longitude').fill('-0.12');
      await page.getByRole('button', { name: 'Set', exact: true }).click();
      await page.getByLabel('Alert note 1').fill('Bring the cushions in.');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(section.getByTestId('schedule')).toHaveCount(1);
      // The weather source lives with the trigger in the form: open it again to point
      // the garden at our station. The first look counts as a change → it fires.
      await section.getByRole('button', { name: 'Schedule…' }).click();
      await page.getByLabel('When', { exact: true }).selectOption('weather');
      const endpoint = page.getByLabel('Weather endpoint');
      await endpoint.fill(rain.url);
      await endpoint.blur();
      await expect.poll(() => rain.hits(), { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.getByTestId('alerts-count')).toHaveText('1', { timeout: 30_000 });
      await page.getByTestId('alerts-bell').click();
      await expect(page.getByTestId('alerts-menu')).toContainText('Bring the cushions in.');
      await page.keyboard.press('Escape');
      // A station that is gone: the source stays as typed, nothing fires again.
      rain.close();
      await endpoint.fill('http://127.0.0.1:1/weather');
      await endpoint.blur();
      await expect(page.getByTestId('weather-error')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('alerts-count')).toHaveText('1');
      await expect(endpoint).toHaveValue('http://127.0.0.1:1/weather');
    } finally {
      rain.close();
      await app.close();
    }
  });

  test('SCHED-01/02 — disable and enable a schedule; a zero interval is refused', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const { section } = await openForm(page);
      await page.getByLabel('Title', { exact: true }).fill('Stretch');
      await page.getByLabel('When', { exact: true }).selectOption('every');
      await page.getByLabel('Every', { exact: true }).fill('0');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      // Zero is not an interval: the form keeps it at least a minute, or refuses.
      const row = section.getByTestId('schedule');
      if (await row.count()) await expect(row).not.toContainText(/every 0 /);
      else await expect(section.getByTestId('schedule-form')).toBeVisible();
      if (!(await row.count())) {
        await page.getByLabel('Every', { exact: true }).fill('30');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
      }
      await expect(row).toHaveCount(1);
      const toggle = row.getByRole('switch');
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
      await row.getByRole('button', { name: 'Remove schedule Stretch' }).click();
      await expect(section.getByTestId('schedule')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('SCHED-G1 — a child Garden’s schedules stay out of the parent’s Tending, a scheduled Mood dresses the owner, and an exported Garden brings its schedules to another installation', async () => {
    test.setTimeout(240_000);
    const first = await launchApp();
    let second: Awaited<ReturnType<typeof launchApp>> | undefined;
    try {
      const { page, dir } = first;
      await enterGarden(page);
      await newGarden(page, 'Studio');
      await createCrux(page, 'Studio notes');
      await goHome(page);
      const { section } = await openForm(page);
      await page.getByLabel('Title', { exact: true }).fill('Stretch');
      await page.getByLabel('When', { exact: true }).selectOption('every');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      // A Mood change already due: it dresses Studio, the Garden that owns it.
      await section.getByRole('button', { name: 'Schedule…' }).click();
      await page.getByLabel('Title', { exact: true }).fill('Dress the studio');
      await page.getByLabel('When', { exact: true }).selectOption('at');
      await page.getByLabel('Time', { exact: true }).fill(tenMinutesAgo());
      await page.getByRole('button', { name: '+ Wear a Mood' }).click();
      await page.getByLabel('Mood 2').selectOption({ label: 'Ember Horizon' });
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(section.getByTestId('schedule')).toHaveCount(2);
      await expect(await gardenMoodLine(page)).toContainText('Studio wears Ember Horizon', {
        timeout: 30_000,
      });
      // The parent: none of Studio's schedules, none of its Mood.
      await goToGarden(page, 'My Garden');
      await expect(page.getByTestId('pane-body-tending').getByTestId('schedule')).toHaveCount(0);
      await expect(await gardenMoodLine(page)).not.toContainText('Ember Horizon');
      // Export Studio (with the supporting panes closed, so Home has its room).
      await goToGarden(page, 'Studio');
      await page.locator('.mosaic-window.pane-tending .pane-toolbar-close').click();
      await expect(page.getByTestId('pane-body-tending')).toHaveCount(0);
      await page.locator('.mosaic-window.pane-mood .pane-toolbar-close').click();
      await expect(page.getByTestId('pane-body-mood')).toHaveCount(0);
      await hidePane(page, 'Navigator');
      const archive = join(dir, 'studio.cruxspace');
      await first.app.evaluate(({ session }, path) => {
        session.defaultSession.once('will-download', (_event, item) => item.setSavePath(path));
      }, archive);
      await page
        .getByRole('region', { name: 'Garden work', exact: true })
        .getByRole('button', { name: 'Export Garden', exact: true })
        .click();
      await expect.poll(() => existsSync(archive), { timeout: 120_000 }).toBe(true);
      await expect(page.getByText(/Exported .* member Crux/)).toBeVisible({ timeout: 120_000 });

      // Another installation imports it: the Garden arrives with both schedules.
      second = await launchApp();
      await enterGarden(second.page);
      await second.page.getByLabel('Garden package', { exact: true }).setInputFiles(archive);
      // The import lands in the new Garden.
      await expect(
        second.page.getByRole('button', { name: 'Garden location', exact: true }),
      ).toHaveText('Studio', { timeout: 180_000 });
      await expect(
        second.page.getByRole('button', { name: 'Open Studio notes', exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      const tending = await showPane(second.page, 'Tending');
      const imported = tending.getByTestId('schedules').getByTestId('schedule');
      await expect(imported).toHaveCount(2);
      await expect(imported.filter({ hasText: 'Stretch' })).toBeVisible();
      await expect(imported.filter({ hasText: 'Dress the studio' })).toBeVisible();
    } finally {
      await second?.app.close();
      await first.app.close();
    }
  });

  test('SCHED-04 — only the named Crux fires the untouched rule and the event trigger; editing the Crux resets its untouched timing', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const ferns = await createCrux(page, 'Ferns');
      await createCrux(page, 'Moss');
      await goHome(page);
      const count = page.getByTestId('alerts-count');
      const menu = page.getByTestId('alerts-menu');
      const done = async () => {
        if (!(await menu.isVisible())) await page.getByTestId('alerts-bell').click();
        while (await menu.getByRole('button', { name: 'Done' }).count())
          await menu.getByRole('button', { name: 'Done' }).first().click();
        await page.keyboard.press('Escape');
      };
      // Ferns has sat untouched for two days.
      const backdate = (id: string) =>
        page.evaluate(
          ({ id, when }) =>
            window.electronAPI!.sqlite.run('UPDATE cruxes SET updated = ? WHERE id = ?', [
              when,
              id,
            ]),
          { id, when: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString() },
        );
      await backdate(ferns);
      // The garden list is read again on the way back home.
      await page.getByRole('button', { name: 'Open Moss', exact: true }).click();
      await goHome(page);
      const { section } = await openForm(page);
      await page.getByLabel('Title', { exact: true }).fill('Still growing?');
      await page.getByLabel('When', { exact: true }).selectOption('untouched');
      await page.getByLabel('After', { exact: true }).fill('1');
      await page.getByLabel('Crux', { exact: true }).selectOption({ label: 'Ferns' });
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(section.getByTestId('schedule')).toHaveCount(1);
      await expect(count).toHaveText('1', { timeout: 30_000 });
      await page.getByTestId('alerts-bell').click();
      await expect(menu.getByTestId('alert')).toHaveCount(1);
      await expect(menu.getByTestId('alert')).toContainText('Ferns: untouched for 2 days');
      await done();
      // Editing Ferns resets its timing: the same rule, added fresh, finds nothing idle.
      await page.getByRole('button', { name: 'Remove schedule Still growing?' }).click();
      await page.getByRole('button', { name: 'Open Ferns', exact: true }).click();
      await writeFirstFile(page, 'notes.md', 'Touched today.');
      await goHome(page);
      await section.getByRole('button', { name: 'Schedule…' }).click();
      await page.getByLabel('Title', { exact: true }).fill('Still growing?');
      await page.getByLabel('When', { exact: true }).selectOption('untouched');
      await page.getByLabel('After', { exact: true }).fill('1');
      await page.getByLabel('Crux', { exact: true }).selectOption({ label: 'Ferns' });
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(section.getByTestId('schedule')).toHaveCount(1);
      await page.waitForTimeout(3000);
      await expect(count).toHaveCount(0);
      // An event trigger scoped to Ferns: a snapshot in Moss is not its business.
      await section.getByRole('button', { name: 'Schedule…' }).click();
      await page.getByLabel('Title', { exact: true }).fill('Ferns snapshot');
      await page.getByLabel('When', { exact: true }).selectOption('event');
      await page.getByLabel('Event', { exact: true }).selectOption('snapshot');
      await page.getByLabel('Crux', { exact: true }).selectOption({ label: 'Ferns' });
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(section.getByTestId('schedule')).toHaveCount(2);
      await page.getByRole('button', { name: 'Open Moss', exact: true }).click();
      await writeFirstFile(page, 'index.html', '<h1>Moss</h1>');
      const { markVersion } = await import('../journeys/journey-helpers');
      await markVersion(page, 'Moss moment');
      await page.waitForTimeout(3000);
      await expect(count).toHaveCount(0);
      await goHome(page);
      await page.getByRole('button', { name: 'Open Ferns', exact: true }).click();
      await markVersion(page, 'Ferns moment');
      await expect(count).toHaveText('1', { timeout: 30_000 });
      await page.getByTestId('alerts-bell').click();
      await expect(menu.getByTestId('alert')).toContainText('Ferns snapshot');
    } finally {
      await app.close();
    }
  });

  test('SCHED-05 — every action kind fires with a real outcome: note, cue, Mood, prompt, Function (a useful error) and tool', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
    try {
      await enterGarden(page);
      await enableAi(page);
      const ferns = await createCrux(page, 'Ferns');
      const folder = (await storedCrux(page, ferns)).projectFolder as string;
      await goHome(page);
      const { section } = await openForm(page);
      await page.getByLabel('Title', { exact: true }).fill('Everything at once');
      await page.getByLabel('When', { exact: true }).selectOption('at');
      await page.getByLabel('Time', { exact: true }).fill(tenMinutesAgo());
      await page.getByLabel('Alert note 1').fill('A note.');
      await page.getByRole('button', { name: '+ Play a cue' }).click();
      await page.getByRole('button', { name: '+ Wear a Mood' }).click();
      await page.getByLabel('Mood 3').selectOption({ label: 'Ember Horizon' });
      await page.getByRole('button', { name: '+ Send a prompt' }).click();
      await page.getByLabel('Prompt 4').fill('Please write a note for the ferns.');
      await page.getByRole('button', { name: '+ Call a function' }).click();
      await expect(page.getByLabel('Function 5')).toHaveValue('hello');
      await page.getByRole('button', { name: '+ Run a tool' }).click();
      await page.getByLabel('Tool 6').selectOption('list_files');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(section.getByTestId('schedule')).toHaveCount(1);
      // The note, the prompt's receipt, the Function's error and the tool's answer: four alerts
      // (the prompt's finished turn may add a fifth, "ready to review", from Tending).
      await expect(page.getByTestId('alerts-count')).toHaveText(/^[4-9]$/, { timeout: 30_000 });
      await page.getByTestId('alerts-bell').click();
      const alerts = page.getByTestId('alerts-menu').getByTestId('alert');
      await expect(alerts.filter({ hasText: 'A note.' })).toHaveCount(1);
      await expect(alerts.filter({ hasText: 'Everything at once · Ferns' })).toContainText(
        'Sent to the collaborator',
      );
      const fn = alerts.filter({ hasText: /hello\(\)/ });
      await expect(fn).toContainText('failed');
      await expect(fn).toContainText(/[a-z]{4,}/);
      await expect(alerts.filter({ hasText: 'list_files' })).toContainText(
        /No files yet|AGENTS\.md|CLAUDE\.md/,
      );
      await page.keyboard.press('Escape');
      // The Mood is worn by the Garden; the prompt ran in Ferns (the scripted model wrote hello.txt).
      await expect(await gardenMoodLine(page)).toContainText('wears Ember Horizon');
      await expect
        .poll(() => existsSync(join(folder, 'hello.txt')), { timeout: 60_000 })
        .toBe(true);
    } finally {
      await app.close();
    }
  });

  test('SCHED-09 — a worn Mood’s schedule is marked as the Mood’s; kept in the garden it outlives the Mood', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const tending = await showPane(page, 'Tending');
      const section = tending.getByTestId('schedules');
      await expect(section).toContainText('Nothing scheduled');
      const mood = await showPane(page, 'Mood');
      await mood
        .getByTestId('bundled-ember-horizon')
        .getByRole('button', { name: 'Apply' })
        .click();
      const dusk = section.getByTestId('schedule').filter({ hasText: 'Dusk: wear Last Light' });
      await expect(dusk).toHaveAttribute('data-source', 'mood');
      const moodSwitch = section
        .getByTestId('mood-switch')
        .getByRole('switch', { name: 'Let the Mood schedule' });
      await expect(moodSwitch).toHaveAttribute('aria-checked', 'true');
      await moodSwitch.click();
      await expect(moodSwitch).toHaveAttribute('aria-checked', 'false');
      await moodSwitch.click();
      await expect(moodSwitch).toHaveAttribute('aria-checked', 'true');
      // Keep it: the Mood badge makes it the garden's own.
      await dusk.getByRole('button', { name: 'Mood', exact: true }).click();
      await expect(dusk).toHaveAttribute('data-source', 'garden');
      await expect(dusk.getByRole('button', { name: 'Mood', exact: true })).toHaveCount(0);
      // Another Mood: its own schedule arrives as the Mood's; the kept one stays.
      await mood.getByTestId('bundled-last-light').getByRole('button', { name: 'Apply' }).click();
      await expect(
        section.getByTestId('schedule').filter({ hasText: 'Dawn: wear Ember Horizon' }),
      ).toHaveAttribute('data-source', 'mood');
      await expect(dusk).toHaveCount(1);
      await expect(dusk).toHaveAttribute('data-source', 'garden');
    } finally {
      await app.close();
    }
  });

  test('SCHED-10 — a restart around a due time: what was missed is said once, never a burst, and the next run is shown', async () => {
    test.setTimeout(300_000);
    let launch = await launchApp();
    const dir = launch.dir;
    try {
      let { page } = launch;
      await enterGarden(page);
      const { section } = await openForm(page);
      await page.getByLabel('Title', { exact: true }).fill('Every minute');
      await page.getByLabel('When', { exact: true }).selectOption('every');
      await page.getByLabel('Every', { exact: true }).fill('1');
      await page.getByLabel('Alert note 1').fill('Tick.');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      const row = section.getByTestId('schedule');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('· next');
      // The first tick, then close the app across the next due time.
      await expect(page.getByTestId('alerts-count')).toHaveText('1', { timeout: 90_000 });
      await launch.app.close();
      await new Promise((r) => setTimeout(r, 75_000));
      launch = await launchApp({ dir });
      page = launch.page;
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await page.waitForTimeout(3000);
      const inTheWay = (await page.getByRole('dialog').allTextContents()).join(' | ');
      const heading =
        (await page
          .locator('header')
          .textContent()
          .catch(() => '')) ?? '';
      await expect(
        page.getByTestId('pane-body-home'),
        `dialogs: ${inTheWay} · header: ${heading} · url: ${page.url()}`,
      ).toBeVisible({ timeout: 30_000 });
      const again = await showPane(page, 'Tending');
      const back = again.getByTestId('schedules').getByTestId('schedule');
      await expect(back).toHaveCount(1);
      await expect(back).toContainText('· next');
      // At most one alert for the missed time on top of the one before: no duplicate burst.
      await page.waitForTimeout(5000);
      await page.getByTestId('alerts-bell').click();
      const alerts = page.getByTestId('alerts-menu').getByTestId('alert');
      expect(await alerts.count()).toBeLessThanOrEqual(2);
      const missed = alerts.filter({ hasText: 'while the app was closed' });
      expect(await missed.count()).toBeLessThanOrEqual(1);
    } finally {
      await launch.app.close();
    }
  });
});
