import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * RESILIENCE-PLAN §2a: automatic backup. Switch it on in Settings → Sync; a
 * crux is pushed once it goes quiet after a snapshot (the quiet window is
 * shortened with CRUX_AUTOBACKUP_QUIET_MS); a plan limit pauses it with the
 * server's words, visible in Settings and in the Sync pane.
 */
test.describe('automatic backup (mocked API, mock AI)', () => {
  test.setTimeout(180_000);

  test('on → a quiet crux is backed up; a 402 pauses it and says why', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({
      env: { CRUX_API_URL: api.url, CRUX_AI_MOCK: '1', CRUX_AUTOBACKUP_QUIET_MS: '400' },
    });
    try {
      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();

      // Connect, then switch automatic backup on (Settings → Account, then Sync)
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(page.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
      await page.locator('h2', { hasText: /^Sync$/ }).click(); // expand the Sync section
      const auto = page.getByTestId('auto-backup');
      await expect(auto).toBeVisible();
      await auto.getByRole('switch').click();
      await expect(auto.getByTestId('auto-backup-status')).toBeVisible();
      // the first garden backup runs on the next hourly tick or start — not asserted here
      await page.keyboard.press('Escape');

      // A crux, a turn that writes a file (the mock model), an auto-snapshot → a quiet backup
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      const composer = page.getByPlaceholder('Send a message...');
      await expect(composer).toBeVisible({ timeout: 30_000 });
      await composer.fill('write hello.md saying hi');
      await composer.press('Enter');
      await expect
        .poll(() => api.log.filter((l) => l.startsWith('PUT /sync/crux/')).length, {
          timeout: 60_000,
        })
        .toBeGreaterThan(0);
      const cruxId = Object.keys(api.state.sync.cruxes)[0]!;
      expect(cruxId).toBeTruthy();

      // The Sync pane says so
      await page.getByRole('button', { name: 'Toggle sync' }).click();
      await expect(page.getByTestId('sync-auto-note')).toContainText('Automatic backup is on');

      // Over the plan: the next quiet backup is refused with a 402 → paused, with the reason.
      // A real change (a new file) and a manual snapshot, since the mock model rewrites the same file.
      api.state.syncOverLimit = true;
      if (
        !(await page
          .getByRole('tree')
          .isVisible()
          .catch(() => false))
      )
        await page.getByRole('button', { name: 'Toggle artifacts' }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('more.md');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('more');
      await page.keyboard.press('ControlOrMeta+s');
      await page.getByRole('button', { name: 'Toggle history' }).click();
      await page
        .getByRole('button', { name: /snapshot/i })
        .first()
        .click();
      const label = page.getByPlaceholder('Label (optional)');
      await label.fill('over');
      await label.press('Enter');
      await expect(page.getByTestId('sync-auto-note')).toContainText('paused', { timeout: 60_000 });
      await expect(page.getByTestId('sync-auto-note')).toContainText('storage is full');
      // Settings shows the same pause; switching off and on lifts it
      await page.keyboard.press('ControlOrMeta+,');
      await page.locator('h2', { hasText: /^Sync$/ }).click();
      await expect(page.getByTestId('auto-backup-paused')).toContainText('storage is full');
      await page.getByTestId('auto-backup').getByRole('switch').click();
      await page.getByTestId('auto-backup').getByRole('switch').click();
      await expect(page.getByTestId('auto-backup-paused')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
