import { test, expect, type Page } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux } from '../multi-crux-helpers';
import { showPane, openPanel } from '../panel-helpers';

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

  test('SETAC-05 — the Garden title and every pane name reach the top bar and headers, and survive a restart', async () => {
    test.setTimeout(150_000);
    const first = await launchApp();
    const dir = first.dir;
    try {
      const { page } = first;
      await enterGarden(page);
      await createCrux(page, 'Renamed everywhere');
      const settings = await showPane(page, 'Settings');
      const names = settings.getByTestId('names-settings');
      await names.getByLabel('Garden title').fill('The Bachelor Pad');
      await names.getByLabel('Garden title').blur();
      for (const [pane, word] of [
        ['Collaboration', 'Talk'],
        ['Artifacts', 'Stuff'],
        ['Workshop', 'Bench'],
        ['Growth', 'Past'],
        ['Tasks', 'Chores'],
      ] as const) {
        const field = names.getByLabel(`Name for ${pane}`);
        await field.fill(word);
        await field.blur();
      }
      await expect(page.locator('header')).toContainText('The Bachelor Pad');
      await expect(
        page.locator('.mosaic-window.pane-collaboration .pane-toolbar-label'),
      ).toHaveText(/talk/i);
      // Tasks arrives with the first task; open it to read its header.
      await openPanel(page, 'tasks', 'Toggle tasks');
      await expect(page.locator('.mosaic-window.pane-tasks .pane-toolbar-label')).toHaveText(
        /chores/i,
      );
      // The toggles keep their functional names for the journeys; the picker shows the new words.
      await page.getByRole('button', { name: 'Add panel', exact: true }).click();
      const picker = page.getByRole('dialog', { name: 'Add panel', exact: true });
      await expect(
        picker.getByRole('button', { name: 'Toggle artifacts', exact: true }),
      ).toContainText('Stuff');
      await page.keyboard.press('Escape');
    } finally {
      await first.app.close();
    }
    const again = await launchApp({ dir });
    try {
      const { page } = again;
      await page.getByRole('button', { name: 'Enter', exact: true }).click({ timeout: 30_000 });
      await expect(page.locator('header')).toContainText('The Bachelor Pad', { timeout: 30_000 });
      await page.getByRole('button', { name: 'Open Renamed everywhere', exact: true }).click();
      await expect(
        page.locator('.mosaic-window.pane-collaboration .pane-toolbar-label'),
      ).toHaveText(/talk/i, { timeout: 30_000 });
    } finally {
      await again.app.close();
    }
  });

  test('SETAC-01 — Settings opens from the account menu, the shortcut and closes from its own header; sections fold; closing it leaves the Crux alone', async () => {
    const { app, page } = await launchApp();
    try {
      await enterGarden(page);
      await createCrux(page, 'Still here');
      // Account menu → Settings.
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /^Settings/ }).click();
      const settings = page.getByRole('region', { name: 'Settings', exact: true });
      await expect(settings).toBeVisible();
      // A folded section opens and folds again; reopening the pane keeps it folded.
      const garden = settings.locator('h2', { hasText: /^Garden$/ });
      const fold = garden.locator('..');
      await expect(fold).toHaveAttribute('aria-expanded', 'false');
      await garden.click();
      await expect(fold).toHaveAttribute('aria-expanded', 'true');
      await expect(settings.getByRole('button', { name: 'Export garden' })).toBeVisible();
      await garden.click();
      await expect(fold).toHaveAttribute('aria-expanded', 'false');
      await expect(settings.getByRole('button', { name: 'Export garden' })).toHaveCount(0);
      // Its own header closes it — and only it.
      await page.locator('.mosaic-window.pane-settings .pane-toolbar-close').click();
      await expect(page.getByTestId('pane-body-settings')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Still here',
      );
      await expect(page.getByTestId('pane-body-collaboration')).toBeVisible();
      // The shortcut toggles it both ways.
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByTestId('pane-body-settings')).toBeVisible();
      await expect(settings.locator('h2', { hasText: /^Garden$/ }).locator('..')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      await page.keyboard.press('ControlOrMeta+,');
      await expect(page.getByTestId('pane-body-settings')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
        'Still here',
      );
    } finally {
      await app.close();
    }
  });

  test('SETAC-04 — the API address: an unreachable one fails in words, Back to default restores it; a launch-pinned address is read-only', async () => {
    test.setTimeout(150_000);
    const free = await launchApp();
    try {
      const { page } = free;
      await enterGarden(page);
      const account = await accountSection(page);
      await account.getByText('Advanced connection settings', { exact: true }).click();
      const address = account.getByTestId('api-address');
      await expect(address).toContainText(/Talking to .*\(the default\)/);
      const box = address.getByRole('textbox', { name: 'API address' });
      // Not an address at all.
      await box.fill('nowhere');
      await address.getByRole('button', { name: 'Use this address' }).click();
      await expect(address).toContainText('Enter an http or https address');
      // A port nobody listens on.
      await box.fill('http://127.0.0.1:1');
      await address.getByRole('button', { name: 'Use this address' }).click();
      await expect(address).toContainText('Talking to http://127.0.0.1:1');
      await account.getByPlaceholder('email@example.com').fill('tester@example.com');
      await account.getByRole('button', { name: 'Send Code' }).click();
      // A failure, said as one — never an empty account.
      await expect(account.getByText(/Failed to send code|connection failed/)).toBeVisible({
        timeout: 30_000,
      });
      await expect(account.getByText(/Connected/)).toHaveCount(0);
      await address.getByRole('button', { name: 'Back to default' }).click();
      await expect(address).toContainText(/Talking to .*\(the default\)/);
      await expect(address.getByRole('button', { name: 'Back to default' })).toHaveCount(0);
    } finally {
      await free.app.close();
    }
    const api = await startMockApi();
    const pinned = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      const { page } = pinned;
      await enterGarden(page);
      const account = await accountSection(page);
      await account.getByText('Advanced connection settings', { exact: true }).click();
      const address = account.getByTestId('api-address');
      await expect(address).toContainText(`Pinned for this launch: ${api.url}`);
      await expect(address.getByRole('textbox', { name: 'API address' })).toHaveCount(0);
      await expect(address.getByRole('button', { name: 'Use this address' })).toHaveCount(0);
    } finally {
      await pinned.app.close();
      await api.close();
    }
  });
});
