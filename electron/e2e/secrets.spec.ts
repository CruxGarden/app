import { fixtureKeychain } from './secret-storage-fixture';
import { test, expect } from '@playwright/test';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { hidePane } from './panel-helpers';

test('Settings preserves keys and input through vault, disk and file failures, then retries', async () => {
  const { app, page, dir } = await launchApp({ ai: true });
  const profile = join(dir, 'userData');
  const file = join(profile, 'secrets.json');
  const secretName = 'cruxgarden:apiKey:anthropic';
  const first = 'sk-ant-fixture-first-abcd';
  const second = 'sk-ant-fixture-second-efgh';
  try {
    await fixtureKeychain(app, false);
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

    await fixtureKeychain(app, true);
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
    await fixtureKeychain(app, false);
    await openSettings();
    await expect(provider.getByRole('alert')).toContainText('Could not read saved key');
    await expect(provider.getByText('Not configured', { exact: true })).toHaveCount(0);
    expect(readFileSync(file, 'utf8')).toBe(replacement);

    await hidePane(page, 'Settings');
    await fixtureKeychain(app, true);
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
