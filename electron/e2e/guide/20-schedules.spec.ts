import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 20 · Schedules — sun and weather triggers, disable and
 * enable, a zero interval. The rest of the section is schedules.spec.ts,
 * mood-schedules.spec.ts and journeys/06.
 */
async function openForm(page: Page) {
  const tending = await showPane(page, 'Tending');
  const section = tending.getByTestId('schedules');
  await section.getByRole('button', { name: 'Schedule…' }).click();
  return { tending, section };
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
});
