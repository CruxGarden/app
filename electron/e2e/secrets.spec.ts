import { test, expect, type ElectronApplication } from '@playwright/test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { hidePane } from './panel-helpers';

async function keychain(app: ElectronApplication, unlocked: boolean) {
  await app.evaluate(({ safeStorage }, unlocked) => {
    // Substitute only the OS vault: use authenticated encryption with a fixture
    // key. Production IPC, filesystem and UI remain real; no OS prompt or secret.
    const crypto = process.getBuiltinModule('crypto');
    const key = Buffer.alloc(32, 42);
    safeStorage.isEncryptionAvailable = () => unlocked;
    safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
    safeStorage.encryptString = (value: string) => {
      const nonce = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
      const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), bytes]);
    };
    safeStorage.decryptString = (bytes: Buffer) => {
      const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
    };
  }, unlocked);
}

test('Settings preserves keys and input through vault, disk and file failures, then retries', async () => {
  const { app, page, dir } = await launchApp({ ai: true });
  const profile = join(dir, 'userData');
  const file = join(profile, 'secrets.json');
  const secretName = 'cruxgarden:apiKey:anthropic';
  const first = 'sk-ant-fixture-first-abcd';
  const second = 'sk-ant-fixture-second-efgh';
  try {
    await keychain(app, false);
    await enterGarden(page);
    const openSettings = async () => {
      await page.keyboard.press('ControlOrMeta+,');
      await page.locator('h2', { hasText: /^AI$/ }).click();
    };
    await openSettings();
    const provider = page.locator('div.p-4.space-y-3', {
      has: page.getByRole('link', { name: 'Anthropic', exact: true }),
    });
    const input = provider.locator('input[type=password]');
    const save = provider.getByRole('button', { name: 'Save', exact: true });
    await input.fill(first);
    await save.click();
    await expect(provider.getByRole('alert')).toContainText('Could not save key');
    await expect(input).toHaveValue(first);
    expect(await page.evaluate((key) => localStorage.getItem(key), secretName)).toBeNull();

    await keychain(app, true);
    await save.click();
    await expect(provider.getByText('sk-ant-...abcd', { exact: true })).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(provider.getByRole('alert')).toHaveCount(0);
    const committed = readFileSync(file, 'utf8');
    expect(committed).not.toContain(first);

    chmodSync(profile, 0o500);
    await input.fill(second);
    await save.click();
    await expect(provider.getByRole('alert')).toContainText('Could not save key');
    await expect(provider.getByText('sk-ant-...abcd', { exact: true })).toBeVisible();
    await expect(input).toHaveValue(second);
    await provider.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(provider.getByRole('alert')).toContainText('Could not remove key');
    expect(readFileSync(file, 'utf8')).toBe(committed);
    chmodSync(profile, 0o700);
    await save.click();
    await expect(provider.getByText('sk-ant-...efgh', { exact: true })).toBeVisible();
    const replacement = readFileSync(file, 'utf8');

    await hidePane(page, 'Settings');
    await keychain(app, false);
    await openSettings();
    await expect(provider.getByRole('alert')).toContainText('Could not read saved key');
    await expect(provider.getByText('Not configured', { exact: true })).toHaveCount(0);
    expect(readFileSync(file, 'utf8')).toBe(replacement);

    await hidePane(page, 'Settings');
    await keychain(app, true);
    writeFileSync(file, '{damaged');
    await openSettings();
    await expect(provider.getByRole('alert')).toContainText('Could not read saved key');
    await input.fill(first);
    await save.click();
    await expect(provider.getByRole('alert')).toContainText('Could not save key');
    expect(readFileSync(file, 'utf8')).toBe('{damaged');

    await hidePane(page, 'Settings');
    writeFileSync(file, replacement);
    await openSettings();
    await expect(provider.getByText('sk-ant-...efgh', { exact: true })).toBeVisible();
    await provider.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(provider.getByText('Not configured', { exact: true })).toBeVisible();
    expect(
      await page.evaluate((key) => window.electronAPI!.secrets.get(key), secretName),
    ).toBeNull();
    expect(await page.evaluate((key) => localStorage.getItem(key), secretName)).toBeNull();
    expect(readFileSync(file, 'utf8')).toBe('{}');
  } finally {
    chmodSync(profile, 0o700);
    await app.close();
  }
});
