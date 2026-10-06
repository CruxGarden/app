import { test, expect } from '@playwright/test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden } from './multi-crux-helpers';
import { fixtureKeychain } from './secret-storage-fixture';
import { connectAccount } from './journeys/journey-helpers';
import { showPane } from './panel-helpers';

test('account credentials save encrypted, survive restart and recover from refused writes, reads and removal', async () => {
  const api = await startMockApi();
  const first = await launchApp({ env: { CRUX_API_URL: api.url } });
  let app = first.app;
  let page = first.page;
  const profile = join(first.dir, 'userData');
  const file = join(profile, 'secrets.json');
  const openAccount = async () => {
    await showPane(page, 'Settings');
    const account = page.getByTestId('account-settings');
    await expect(
      account
        .getByPlaceholder('email@example.com')
        .or(account.getByRole('button', { name: 'Disconnect', exact: true })),
    ).toBeVisible();
    return account;
  };
  try {
    await enterGarden(page);
    await fixtureKeychain(app, false);
    let account = await openAccount();
    await connectAccount(page, account);
    await expect(account.getByRole('alert')).toContainText('Could not save the account connection');
    await expect(account.getByPlaceholder('Enter code')).toHaveValue('123456');
    await fixtureKeychain(app, true);
    await account.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(account.getByText(/Connected —/)).toContainText('tester@example.com');
    const ciphertext = readFileSync(file, 'utf8');
    const stored = await page.evaluate(async () => {
      const raw = await window.electronAPI!.secrets.get('cruxgarden:authSession');
      return JSON.parse(raw!) as { endpoint: string; accessToken: string; refreshToken: string };
    });
    expect(stored.endpoint).toBe(api.url);
    expect(ciphertext).not.toContain(stored.accessToken);
    expect(ciphertext).not.toContain(stored.refreshToken);
    expect(
      await page.evaluate(() => [
        localStorage.getItem('cruxgarden:accessToken'),
        localStorage.getItem('cruxgarden:refreshToken'),
        localStorage.getItem('cruxgarden:authSession'),
      ]),
    ).toEqual([null, null, null]);
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all(
          "SELECT key FROM settings WHERE key IN ('cruxgarden:authSession', 'cruxgarden:accessToken', 'cruxgarden:refreshToken')",
        ),
      ),
    ).toEqual([]);

    await app.close();
    writeFileSync(file, '{damaged');
    const next = await launchApp({ dir: first.dir, env: { CRUX_API_URL: api.url } });
    app = next.app;
    page = next.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
    account = await openAccount();
    await expect(account.getByRole('alert')).toContainText('Could not read the saved connection');
    expect(readFileSync(file, 'utf8')).toBe('{damaged');
    writeFileSync(file, ciphertext);
    await account.getByRole('button', { name: 'Retry saved connection' }).click();
    await expect(account.getByText(/Connected —/)).toContainText('tester@example.com');

    chmodSync(profile, 0o500);
    await account.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(account.getByRole('alert')).toContainText('Could not remove the saved connection');
    await expect(account.getByText(/Connected —/)).toContainText('tester@example.com');
    expect(readFileSync(file, 'utf8')).toBe(ciphertext);
    chmodSync(profile, 0o700);
    await account.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(account.getByPlaceholder('email@example.com')).toBeVisible();
    expect(
      await page.evaluate(() => window.electronAPI!.secrets.get('cruxgarden:authSession')),
    ).toBeNull();
  } finally {
    chmodSync(profile, 0o700);
    await app.close();
    await api.close();
  }
});

test('declining a different account removes its saved session and keeps the local author', async () => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    await showPane(page, 'Settings');
    const account = page.getByTestId('account-settings');
    await expect(account.getByPlaceholder('email@example.com')).toBeVisible();
    await connectAccount(page, account);
    await expect(account.getByText(/Connected —/)).toContainText('tester@example.com');
    const before = await page.evaluate(() =>
      window.electronAPI!.sqlite.all('SELECT id, username FROM authors'),
    );
    await account.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await account.getByPlaceholder('email@example.com').fill('other@example.com');
    await account.getByRole('button', { name: 'Send Code' }).click();
    await account.getByPlaceholder('Enter code').fill('123456');
    await account.getByRole('button', { name: 'Connect', exact: true }).click();
    const choice = page.getByRole('dialog').filter({ hasText: 'A different account' });
    await expect(choice).toBeVisible();
    await choice.getByRole('button', { name: 'Stay disconnected' }).click();
    await expect(account.getByRole('alert')).toContainText(
      'this garden belongs to a different account',
    );
    expect(
      await page.evaluate(() => window.electronAPI!.secrets.get('cruxgarden:authSession')),
    ).toBeNull();
    expect(
      await page.evaluate(() => window.electronAPI!.sqlite.all('SELECT id, username FROM authors')),
    ).toEqual(before);
  } finally {
    await app.close();
    await api.close();
  }
});
