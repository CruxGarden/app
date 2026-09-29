import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

test('the native settings owner refuses credentials and exports a clean copy without deleting misplaced source data', async () => {
  const { app, page } = await launchApp();
  const key = 'cruxgarden:authSession';
  const canary = 'fixture-misplaced-account-credential';
  try {
    await enterGarden(page);
    const refusals = await page.evaluate(async () => {
      const settings = window.electronAPI!.sqlite.settings;
      const results: string[] = [];
      for (const key of [
        'cruxgarden:authSession',
        'cruxgarden:accessToken',
        'cruxgarden:refreshToken',
        'cruxgarden:apiKey:fixture',
        'cruxgarden:fn-secrets:fixture',
        'apiKey:anthropic',
        'cruxgarden:anthropicApiKey',
      ]) {
        try {
          await settings.put(key, 'fixture-secret');
          results.push('accepted');
        } catch (error) {
          results.push((error as Error).message);
        }
      }
      await settings.put('cruxgarden:test-preference', 'kept');
      return results;
    });
    expect(refusals).toHaveLength(7);
    expect(refusals.every((message) => /Credentials cannot be saved/.test(message))).toBe(true);

    // Explicit development-only fixture writes simulate misplaced existing data.
    await page.evaluate(
      async ({ key, canary }) => {
        await window.electronAPI!.sqlite.run('INSERT INTO settings (key, value) VALUES (?, ?)', [
          key,
          canary,
        ]);
      },
      { key, canary },
    );
    const exported = await page.evaluate(
      async ({ key, canary }) => {
        const db = window.electronAPI!.sqlite;
        const image = new TextDecoder().decode(await db.export());
        return {
          containsCredential: image.includes(canary),
          containsPreference: image.includes('cruxgarden:test-preference'),
          visible: (await db.settings.list()).some((row) => row.key === key),
          retained: await db.get('SELECT value FROM settings WHERE key = ?', [key]),
        };
      },
      { key, canary },
    );
    expect(exported).toEqual({
      containsCredential: false,
      containsPreference: true,
      visible: false,
      retained: { value: canary },
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
    expect(
      await page.evaluate(
        (key) => window.electronAPI!.sqlite.get('SELECT value FROM settings WHERE key = ?', [key]),
        key,
      ),
    ).toEqual({ value: canary });
  } finally {
    await app.close();
  }
});
