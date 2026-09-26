import { test, expect, type Page } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { showPane } from '../panel-helpers';

/**
 * V1-TESTING-GUIDE § 22 · Settings: Account and Names — a wrong code,
 * disconnecting, the username's rules, and long pane names. SETAC-01/04/05
 * are in settings.spec.ts, local-api-settings.spec.ts and names.spec.ts.
 */
async function accountSection(page: Page) {
  const settings = await showPane(page, 'Settings');
  return settings.getByTestId('account-settings');
}

test.describe('guide 22 · Account and Names', () => {
  test('SETAC-02 — a wrong code is refused with words; a second try connects; logging out keeps the garden', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Kept while out');
      const account = await accountSection(page);
      await account.getByPlaceholder('email@example.com').fill('tester@example.com');
      await account.getByRole('button', { name: 'Send Code' }).click();
      await account.getByPlaceholder('Enter code').fill('000000');
      await account.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(account.getByText(/Invalid code|connection failed/)).toBeVisible();
      // Resend, then the right code.
      await account.getByPlaceholder('Enter code').fill('123456');
      await account.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(account.getByText(/Connected/)).toBeVisible({ timeout: 30_000 });
      await expect(account.getByText('tester@example.com').first()).toBeVisible();
      // Log out from the account menu: the connection goes, the work stays.
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page
        .getByRole('menuitem', { name: 'Log out' })
        .or(page.getByText('Log out'))
        .first()
        .click();
      await expect(page.getByPlaceholder('email@example.com').first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Kept while out',
      );
    } finally {
      await app.close();
    }
  });

  test('SETAC-03 — the username follows its rules: too short, bad characters, taken, and one that works', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      await enterGarden(page);
      await createCrux(page, 'Named');
      const account = await accountSection(page);
      await account.getByPlaceholder('email@example.com').fill('tester@example.com');
      await account.getByRole('button', { name: 'Send Code' }).click();
      await account.getByPlaceholder('Enter code').fill('123456');
      await account.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(account.getByText(/Connected/)).toBeVisible({ timeout: 30_000 });

      const current = await page.evaluate(async () => {
        const row = (await window.electronAPI!.sqlite.get(
          'SELECT username FROM authors ORDER BY created LIMIT 1',
        )) as { username: string };
        return row.username;
      });
      const edit = account.getByRole('button', { name: current, exact: true });
      const tryName = async (name: string) => {
        await edit.click();
        const box = account.getByRole('textbox').last();
        await box.fill(name);
        await account.getByRole('button', { name: 'Save', exact: true }).click();
      };
      await tryName('ab');
      await expect(account.getByText('At least 3 characters')).toBeVisible();
      await account.getByRole('button', { name: 'Cancel', exact: true }).click();
      await tryName('bad name!');
      await expect(account.getByText('Letters, numbers, hyphens, underscores only')).toBeVisible();
      await account.getByRole('button', { name: 'Cancel', exact: true }).click();
      await tryName('taken');
      await expect(account.getByText('Username is taken at crux.garden')).toBeVisible();
      await account.getByRole('button', { name: 'Cancel', exact: true }).click();
      await tryName('fern_keeper');
      await expect(account.getByRole('button', { name: 'fern_keeper', exact: true })).toBeVisible({
        timeout: 30_000,
      });
      // Persisted, not just shown.
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const row = (await window.electronAPI!.sqlite.get(
              'SELECT username FROM authors ORDER BY created LIMIT 1',
            )) as { username: string };
            return row.username;
          }),
        )
        .toBe('fern_keeper');
    } finally {
      await app.close();
    }
  });

  test('SETAC-06 — a long pane name stays readable and Clear restores the usual word', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Renamed panes');
      const settings = await showPane(page, 'Settings');
      const names = settings.getByTestId('names-settings');
      const field = names.getByLabel('Name for Collaboration');
      const long = 'The Conversation Where All The Thinking Happens Together At Length';
      await field.fill(long);
      await field.blur();
      const header = page.locator('.mosaic-window.pane-collaboration .pane-toolbar-label');
      await expect(header).toContainText('The Conversation');
      // The header does not push the close control out of the pane.
      const pane = (await page.locator('.mosaic-window.pane-collaboration').boundingBox())!;
      const close = (await page
        .locator('.mosaic-window.pane-collaboration .pane-toolbar-close')
        .boundingBox())!;
      expect(close.x + close.width).toBeLessThanOrEqual(pane.x + pane.width + 1);
      await field.fill('');
      await field.blur();
      await expect(header).toHaveText(/^Collaboration$/i);
    } finally {
      await app.close();
    }
  });
});
