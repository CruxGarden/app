import { finishSetupAtHome } from './multi-crux-helpers';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('an unconfigured collaborator responds without accessing the system Keychain', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '0' } });
  try {
    // Guard only OS crypto, leaving the real renderer service, IPC and native
    // secret-file lookup in place. A regression fails without opening a
    // blocking system prompt on the test machine.
    await app.evaluate(({ safeStorage }) => {
      const calls: string[] = [];
      Object.assign(globalThis, { emptySecretCryptoCalls: calls });
      safeStorage.isEncryptionAvailable = () => {
        calls.push('available');
        return false;
      };
      safeStorage.decryptString = () => {
        calls.push('decrypt');
        throw new Error('An empty secret store must not decrypt');
      };
    });
    await page.getByRole('button', { name: /enter/i }).click();
    await page.getByText('Plant a new garden').click();
    await finishSetupAtHome(page);
    await page.getByRole('button', { name: 'Add Crux' }).click();
    await page.getByRole('button', { name: /^Blank/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const input = page.getByPlaceholder('Send a message...');
    await expect(input).toBeVisible();
    await input.fill('Hello');
    await input.press('Enter');
    await expect(page.getByText(/No API key configured for/)).toBeVisible();
    expect(await app.evaluate(() => Reflect.get(globalThis, 'emptySecretCryptoCalls'))).toEqual([]);
  } finally {
    await app.close();
  }
});
