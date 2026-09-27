import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux, goHome, storedCrux } from '../multi-crux-helpers';
import { showPane, hidePane } from '../panel-helpers';
import { connectAccount, writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 25 · Settings: Sync, Plan, Usage, Garden and Desktop —
 * the per-Crux backup listing, the billing return pages, Usage's error
 * versus zero, the Garden location, Installed tools' Remove, the Desktop
 * section on a development build, and close versus Quit with docking off.
 * Real checkout, packaged updates and the wipe are billing-simulation,
 * updater.unit and guardrails specs.
 */

/** Sign in from Settings → Account and open the Sync section. */
async function connectAndOpenSync(page: Page) {
  const settings = await showPane(page, 'Settings');
  await connectAccount(page, settings);
  await expect(settings.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
  await settings.locator('h2', { hasText: /^Sync$/ }).click();
  return settings;
}

/** Route the in-app router without reloading the shell. */
async function visit(page: Page, path: string) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test.describe('guide 25 · Sync, Plan, Usage, Garden and Desktop', () => {
  test('SETDATA-01 — automatic backup lists every backed-up Crux; Settings and the Sync pane agree; Remove takes one out', async () => {
    test.setTimeout(180_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({
      env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1', CRUX_AUTOBACKUP_QUIET_MS: '400' },
    });
    try {
      await enterGarden(page);
      const settings = await connectAndOpenSync(page);
      const auto = settings.getByTestId('auto-backup');
      await auto.getByRole('switch').click();
      await expect(auto.getByTestId('auto-backup-status')).toBeVisible();
      await expect(settings.getByText('No cruxes synced to cloud yet.')).toBeVisible();
      await hidePane(page, 'Settings');

      // Two projects, each with one collaborator turn that writes a file → two quiet backups.
      const pushes = () => api.log.filter((l) => l.startsWith('PUT /sync/crux/')).length;
      for (const title of ['Backed alpha', 'Backed beta']) {
        const before = Object.keys(api.state.sync.cruxes).length;
        await createCrux(page, title);
        const composer = page.getByPlaceholder('Send a message...');
        await composer.fill('write a greeting');
        await composer.press('Enter');
        await expect(page.getByText('Done — I wrote that file for you.')).toBeVisible({
          timeout: 30_000,
        });
        await expect
          .poll(() => Object.keys(api.state.sync.cruxes).length, { timeout: 60_000 })
          .toBe(before + 1);
      }
      expect(pushes()).toBeGreaterThanOrEqual(2);
      const titles = Object.values(api.state.sync.cruxes).map((c) => c.title);
      expect(titles).toEqual(expect.arrayContaining(['Backed alpha', 'Backed beta']));

      // The Sync pane of the open Crux says automatic backup is on.
      await page.getByRole('button', { name: 'Add panel', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Add panel', exact: true })
        .getByRole('button', { name: 'Toggle sync', exact: true })
        .click();
      await expect(page.getByTestId('sync-auto-note')).toContainText('Automatic backup is on');

      // Settings → Sync lists both; Remove takes one away here and at the API.
      const again = await showPane(page, 'Settings');
      if (
        !(await again
          .getByTestId('auto-backup')
          .isVisible()
          .catch(() => false))
      )
        await again.locator('h2', { hasText: /^Sync$/ }).click();
      // A synced row: title, size, date and Remove (the Agents list names the Cruxes too).
      const row = (title: string) =>
        again
          .locator('div.flex.items-center.justify-between', { hasText: title })
          .filter({ has: page.getByRole('button', { name: 'Remove', exact: true }) });
      await expect(row('Backed alpha')).toBeVisible({ timeout: 30_000 });
      await expect(row('Backed beta')).toBeVisible();
      const alphaId = Object.entries(api.state.sync.cruxes).find(
        ([, c]) => c.title === 'Backed alpha',
      )![0];
      await row('Backed alpha').getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(row('Backed alpha')).toHaveCount(0);
      await expect(row('Backed beta')).toBeVisible();
      await expect.poll(() => alphaId in api.state.sync.cruxes).toBe(false);
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('SETDATA-03 — the billing return pages: success, cancel and an unknown outcome each say so and lead home; cancel buys nothing', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      const settings = await showPane(page, 'Settings');
      await connectAccount(page, settings);
      await expect(settings.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
      await expect(settings.getByTestId('plan-status')).toContainText('Free');
      await hidePane(page, 'Settings');

      const cases: Array<[string, RegExp]> = [
        ['/billing/cancel', /No changes made/],
        ['/billing/success', /all set/],
        ['/billing/return', /Billing updated/],
        ['/billing/not-a-real-outcome', /Billing updated/],
      ];
      for (const [path, heading] of cases) {
        await visit(page, path);
        await expect(page.getByRole('heading', { name: heading })).toBeVisible({
          timeout: 15_000,
        });
        // Every return page offers the way back.
        await expect(page.getByRole('link', { name: 'crux.garden' })).toBeVisible();
      }
      await expect(page.getByText('Checkout was cancelled')).toHaveCount(0);
      await visit(page, '/billing/cancel');
      await expect(page.getByText(/Checkout was cancelled/)).toBeVisible();
      // Back in the garden: the plan is still Free and nothing was bought.
      await page.getByRole('link', { name: 'crux.garden' }).click();
      // "/" is the Gateway; Enter leads back into the garden.
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await expect(page.getByTestId('pane-body-home')).toBeVisible({ timeout: 30_000 });
      const again = await showPane(page, 'Settings');
      await expect(again.getByTestId('plan-status')).toContainText('Free');
      expect(api.state.billing.checkouts).toBe(0);
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('SETDATA-04 — Usage tells an unreachable API apart from zero use; the limits are explained', async () => {
    test.setTimeout(150_000);
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      const settings = await showPane(page, 'Settings');
      await connectAccount(page, settings);
      await expect(settings.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
      const usage = settings.getByTestId('usage-settings');
      await expect(usage).toBeVisible();
      // Nothing published, nothing synced: zeros, not an error.
      await expect(usage).toContainText('Free plan', { timeout: 30_000 });
      await expect(usage).toContainText(/0 B/);
      await expect(usage.getByText('Usage is unavailable right now')).toHaveCount(0);
      await expect(usage.getByTestId('settlement-note')).toContainText(/share these limits/);
      // The API stops answering: the section says so instead of showing zeros.
      api.state.failUsage = true;
      await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
      await expect(usage.getByText('Usage is unavailable right now')).toBeVisible({
        timeout: 30_000,
      });
      await expect(usage.getByTestId('sync-usage')).toHaveCount(0);
      // Back: the meters return.
      api.state.failUsage = false;
      await page.evaluate(() => window.dispatchEvent(new Event('crux:usage-changed')));
      await expect(usage.getByText('Usage is unavailable right now')).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect(usage).toContainText(/0 B/);
    } finally {
      await app.close();
      await api.close();
    }
  });

  test('SETDATA-06 — a new Garden location takes new Cruxes; older ones stay where they were and still open', async () => {
    test.setTimeout(150_000);
    const { app, page, dir } = await launchApp();
    const elsewhere = mkdtempSync(join(tmpdir(), 'crux-e2e-root-'));
    try {
      await enterGarden(page);
      const oldId = await createCrux(page, 'Old ground');
      await writeFirstFile(page, 'index.html', '<h1>Old ground</h1>');
      const oldFolder = (await storedCrux(page, oldId)).projectFolder as string;
      expect(oldFolder.startsWith(join(dir, 'garden'))).toBe(true);
      await goHome(page);

      // Settings → Garden → Choose…: the native folder picker answers with the new folder.
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as never;
      }, elsewhere);
      const settings = await showPane(page, 'Settings');
      await settings.locator('h2', { hasText: /^Garden$/ }).click();
      await expect(settings.getByRole('heading', { name: 'Garden location' })).toBeVisible();
      await settings.getByRole('button', { name: 'Choose…' }).click();
      await expect(settings.locator('code', { hasText: elsewhere.split('/').pop()! })).toBeVisible({
        timeout: 15_000,
      });
      await hidePane(page, 'Settings');

      // A new Crux lands in the new location.
      const newId = await createCrux(page, 'New ground');
      await writeFirstFile(page, 'index.html', '<h1>New ground</h1>');
      const newFolder = (await storedCrux(page, newId)).projectFolder as string;
      expect(newFolder.startsWith(elsewhere)).toBe(true);
      await expect.poll(() => existsSync(join(newFolder, 'index.html'))).toBe(true);

      // The older one did not move and still works.
      expect((await storedCrux(page, oldId)).projectFolder).toBe(oldFolder);
      expect(readFileSync(join(oldFolder, 'index.html'), 'utf8')).toContain('Old ground');
      await goHome(page);
      await page.getByRole('button', { name: 'Open Old ground', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Old ground',
      );
      await expect(page.getByRole('tree').getByText('index.html')).toBeVisible({ timeout: 30_000 });
    } finally {
      await app.close();
    }
  });

  test('SETDATA-07 — Installed tools: Remove asks, Keep it keeps, Remove forgets the tool; other Cruxes keep their work', async () => {
    test.setTimeout(150_000);
    const first = await launchApp();
    const dir = first.dir;
    try {
      const { page } = first;
      await enterGarden(page);
      await createCrux(page, 'Kept work');
      await writeFirstFile(page, 'index.html', '<h1>Kept</h1>');
      // An installed tool is a Template Crux of kind "tool" plus a registry row.
      const toolCrux = await createCrux(page, 'Sketch template');
      await page.evaluate(async (id) => {
        const db = window.electronAPI!.sqlite;
        await db.run(
          "UPDATE cruxes SET kind = 'tool', meta = json_set(meta, '$.template', 'p5-app') WHERE id = ?",
          [id],
        );
        await db.run('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', [
          'cruxgarden:installedTools',
          JSON.stringify({
            'p5-app': { id: 'p5-app', cruxId: id, installedAt: new Date().toISOString() },
          }),
        ]);
      }, toolCrux);
    } finally {
      await first.app.close();
    }
    const again = await launchApp({ dir });
    try {
      const { page } = again;
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await expect(page.getByTestId('pane-body-home')).toBeVisible({ timeout: 30_000 });
      const settings = await showPane(page, 'Settings');
      await settings.locator('h2', { hasText: /^Garden$/ }).click();
      const tools = settings.getByTestId('installed-tools');
      const row = tools.getByTestId('installed-tool-p5-app');
      await expect(row).toBeVisible();
      await expect(row).toContainText('from a .crux package');
      // Keep it: nothing changes.
      await row.getByRole('button', { name: 'Remove' }).click();
      const ask = page.getByRole('dialog').filter({ hasText: /^Remove .*\?/ });
      await expect(ask).toContainText('Cruxes you made from it keep working');
      await ask.getByRole('button', { name: 'Keep it' }).click();
      await expect(row).toBeVisible();
      // Remove: gone from the list; the registry forgets it.
      await row.getByRole('button', { name: 'Remove' }).click();
      await page
        .getByRole('dialog')
        .filter({ hasText: /^Remove .*\?/ })
        .getByRole('button', { name: 'Remove', exact: true })
        .click();
      await expect(row).toHaveCount(0);
      await expect(tools.getByText('None yet')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const r = (await window.electronAPI!.sqlite.get(
              "SELECT value FROM settings WHERE key = 'cruxgarden:installedTools'",
            )) as { value: string } | undefined;
            return r?.value ?? '{}';
          }),
        )
        .toBe('{}');
      await hidePane(page, 'Settings');
      // The other project is untouched.
      await page.getByRole('button', { name: 'Open Kept work', exact: true }).click();
      await expect(page.getByRole('tree').getByText('index.html')).toBeVisible({ timeout: 30_000 });
    } finally {
      await again.app.close();
    }
  });

  test('SETDATA-09 — Settings → Desktop on a development build: the version is shown, updates are honest about not applying, the start-up check is a preference', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      const settings = await showPane(page, 'Settings');
      const desktop = settings.getByTestId('desktop-settings');
      await expect(desktop).toBeVisible();
      await expect(desktop).toContainText(/v\d+\.\d+\.\d+ · \w+-\w+ · dev/);
      await expect(desktop.getByTestId('update-status')).toHaveText(
        'Updates apply to installed builds only.',
      );
      // No control pretends to fetch a release into a dev build.
      await expect(desktop.getByRole('button', { name: 'Download' })).toHaveCount(0);
      await expect(desktop.getByRole('button', { name: 'Restart to update' })).toHaveCount(0);
      const check = desktop.getByRole('button', { name: 'Check for updates' });
      if (await check.count()) await expect(check).toBeDisabled();
      // The start-up check is a preference of installed builds: shown, not changeable here.
      const auto = desktop.getByRole('switch', { name: 'Check for updates when the app starts' });
      await expect(auto).toBeVisible();
      await expect(auto).toBeDisabled();
    } finally {
      await app.close();
    }
  });

  test('SETDATA-10 — with the menu-bar switch off: Quit ends the process and the garden reopens intact; closing the window is a real close, not a hide', async () => {
    test.setTimeout(150_000);
    const first = await launchApp();
    const dir = first.dir;
    let exited = false;
    try {
      const { app, page } = first;
      await enterGarden(page);
      const settings = await showPane(page, 'Settings');
      const toggle = settings.getByRole('switch', {
        name: 'Keep running in the menu bar when the window closes',
      });
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
      await hidePane(page, 'Settings');
      // Something that would fire later: a schedule a minute out.
      await page
        .locator('header')
        .getByRole('button', { name: /^Tending/ })
        .click();
      await page.getByTestId('schedules').getByRole('button', { name: 'Schedule…' }).click();
      await page.getByLabel('Title', { exact: true }).fill('After quit');
      await page.getByLabel('When', { exact: true }).selectOption('every');
      await page.getByLabel('Every', { exact: true }).fill('1');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByTestId('schedules').getByTestId('schedule')).toHaveCount(1);
      // An explicit Quit ends the process; nothing can tick afterwards.
      const proc = app.process();
      const gone = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
      await app.evaluate(({ app }) => app.quit()).catch(() => {});
      await gone;
      exited = true;
      expect(proc.exitCode).not.toBeNull();
    } finally {
      if (!exited) await first.app.close();
    }
    const again = await launchApp({ dir });
    const proc = again.app.process();
    try {
      const { app, page } = again;
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await expect(page.getByTestId('pane-body-home')).toBeVisible({ timeout: 30_000 });
      await page
        .locator('header')
        .getByRole('button', { name: /^Tending/ })
        .click();
      await expect(page.getByTestId('schedules').getByTestId('schedule')).toHaveCount(1);
      // Close the window the way the red button does: with docking off it goes (not hides).
      // The page is gone and, under the test harness, so is the process — docked.spec is
      // the contrast, where the same close leaves a hidden window that still answers.
      const closed = page.waitForEvent('close');
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
      await closed;
      expect(page.isClosed()).toBe(true);
      await expect.poll(() => proc.exitCode, { timeout: 30_000 }).not.toBeNull();
    } finally {
      await again.app.close().catch(() => {});
      if (proc.exitCode === null) proc.kill('SIGTERM');
    }
  });
});
