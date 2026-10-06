import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, createCrux, reenterWorkspace } from './multi-crux-helpers';
import { connectAccount } from './journeys/journey-helpers';
import { showPane } from './panel-helpers';

test('closing a hosted account checks server support, confirms scope, retries and preserves the local Garden', async () => {
  const api = await startMockApi();
  const launched = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  let { app, page } = launched;
  try {
    await enterGarden(page);
    await createCrux(page, 'Still mine');
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    await showPane(page, 'Settings');
    const account = page.getByTestId('account-settings');
    await connectAccount(page, account);
    api.state.accountClosureSupported = false;
    await account.getByRole('button', { name: 'Close hosted account…' }).click();
    await expect(account.getByRole('alert')).toContainText('Could not check');
    const close = account.getByRole('button', { name: 'Close account permanently' });
    await expect(close).toBeDisabled();
    api.state.accountClosureSupported = true;
    await account.getByRole('button', { name: 'Retry check' }).click();
    await account.getByLabel('Type DELETE MY ACCOUNT to continue').fill('DELETE MY ACCOUNT');
    await close.click();
    await page
      .getByRole('dialog', { name: 'Permanently close this account?' })
      .getByRole('button', { name: 'Cancel' })
      .click();
    expect(api.state.accountClosed).not.toBe(true);
    api.state.failAccountClosure = true;
    await close.click();
    await page
      .getByRole('dialog', { name: 'Permanently close this account?' })
      .getByRole('button', { name: 'Close account', exact: true })
      .click();
    await expect(account.getByRole('alert')).toContainText('retry to finish');
    expect(api.state.accountClosed).not.toBe(true);
    api.state.failAccountClosure = false;
    await close.click();
    await page
      .getByRole('dialog', { name: 'Permanently close this account?' })
      .getByRole('button', { name: 'Close account', exact: true })
      .click();
    await expect(page.getByRole('alertdialog', { name: 'Account closed' })).toBeVisible();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await expect(account.getByPlaceholder('email@example.com')).toBeVisible();
    expect(
      await page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.get(
            'SELECT title FROM cruxes WHERE id = ? AND deleted IS NULL',
            [id],
          ),
        id,
      ),
    ).toMatchObject({ title: 'Still mine' });
    await app.close();
    ({ app, page } = await launchApp({
      dir: launched.dir,
      ai: false,
      env: { CRUX_API_URL: api.url },
    }));
    await reenterWorkspace(page, 'Still mine');
    await showPane(page, 'Settings');
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Still mine',
    );
    await expect(
      page.getByTestId('account-settings').getByPlaceholder('email@example.com'),
    ).toBeVisible();
  } finally {
    await app.close();
    await api.close();
  }
});
