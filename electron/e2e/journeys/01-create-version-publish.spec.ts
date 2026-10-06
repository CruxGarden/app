import { test, expect } from '@playwright/test';
import { launchApp } from '../launch';
import { startMockApi } from '../api-mock';
import { enterGarden, createCrux, goHome } from '../multi-crux-helpers';
import { openPanel } from '../panel-helpers';
import { writeFirstFile, markVersion, connectAccount } from './journey-helpers';

/** The core loop: create → version → publish, then it's on the public garden. */
test('create, version and publish a Crux', async () => {
  test.setTimeout(180_000);
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    await createCrux(page, 'Sun page');
    await writeFirstFile(page, 'index.html', '<h1>The sun</h1>');
    await markVersion(page, 'First light');
    const editor = page.locator('.monaco-editor').first();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await expect(editor.locator('.view-lines')).toHaveText('');
    await page.keyboard.insertText('<h1>Fresh sunshine</h1>');
    // Share owns saving the visible draft; no editor Save is performed here.
    await expect(editor).toContainText('Fresh sunshine');

    const share = await openPanel(page, 'publish', 'Toggle share');
    await share.getByRole('button', { name: 'Share', exact: true }).click({ timeout: 60_000 });
    await connectAccount(page);
    const ask = page.getByRole('dialog').filter({ hasText: 'A published site is not a backup' });
    await expect(ask).toBeVisible({ timeout: 30_000 });
    await ask.getByRole('button', { name: 'Share without a backup' }).click();
    await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/\/tester\/[a-z0-9-]+$/)).toBeVisible();
    expect(Object.keys(api.state.published)).toHaveLength(1);
    const files = Object.values(api.state.published)[0];
    expect(files.find((file) => file.path === 'index.html')?.bytes.toString()).toBe(
      '<h1>Fresh sunshine</h1>',
    );

    // Home shows it as shared; nothing about the Garden went out with it.
    await goHome(page);
    await expect(page.getByText('Shared', { exact: true })).toBeVisible();
    const sent = api.state.crux!;
    expect(JSON.stringify(sent)).not.toMatch(/gardenCollaboration|gardenSchedules|moodSelection/);
  } finally {
    await app.close();
    await api.close();
  }
});
