import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, createCrux, addArtifact, switchCrux } from './multi-crux-helpers';

test('pulling one Crux preserves another open workspace and its unsent draft', async () => {
  const api = await startMockApi();
  const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
  try {
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Cloud study');
    await addArtifact(page, 'study.txt');
    await page.locator('.monaco-editor').click();
    await page.keyboard.type('Cloud copy');
    await expect(page.locator('.monaco-editor')).toContainText('Cloud copy');
    await page.keyboard.press('ControlOrMeta+s');
    await page.getByRole('button', { name: 'Toggle sync' }).click();
    await page.getByPlaceholder('email@example.com').fill('tester@example.com');
    await page.getByRole('button', { name: 'Send Code' }).click();
    await page.getByPlaceholder('Enter code').fill('123456');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByRole('button', { name: 'Push to cloud', exact: true }).click();
    await expect(page.getByText('Pushed successfully')).toBeVisible();
    const archive = await JSZip.loadAsync(api.state.sync.cruxes[cruxId]!.data!);
    const version = JSON.parse(await archive.file('versions/current.json')!.async('text'));
    expect(
      await archive.file('artifacts/' + version.artifacts['study.txt'].fingerprint)!.async('text'),
    ).toBe('Cloud copy');
    await page.locator('.monaco-editor').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Local changes to replace');
    await expect(page.locator('.monaco-editor')).toContainText('Local changes to replace');
    await createCrux(page, 'Unfinished thought');
    await page.getByPlaceholder('Send a message...').fill('Keep this unsent thought');
    await switchCrux(page, 'Cloud study');
    await page.evaluate(() => {
      document.documentElement.dataset.syncProbe = 'same document';
    });
    await page.getByRole('button', { name: 'Pull from cloud', exact: true }).click();
    const ask = page.getByRole('dialog', { name: 'Pull from cloud' });
    await ask.getByRole('button', { name: /^Pull(?: anyway)?$/, exact: true }).click();
    await expect(page.getByText(/Pull complete/)).toBeVisible();
    // The old path schedules a full reload 800 ms after this success message.
    await page.waitForTimeout(1500);
    await expect(page.locator('html')).toHaveAttribute('data-sync-probe', 'same document');
    const diskMeta = (await page.evaluate(
      async (id) => window.electronAPI!.sqlite.get('SELECT meta FROM cruxes WHERE id = ?', [id]),
      cruxId,
    )) as { meta: string };
    expect(readFileSync(join(JSON.parse(diskMeta.meta).projectFolder, 'study.txt'), 'utf8')).toBe(
      'Cloud copy',
    );
    await page.getByRole('tree').getByText('study.txt', { exact: true }).click();
    await expect(page.locator('.monaco-editor .view-lines').first()).toContainText('Cloud copy');
    await expect(page.locator('.monaco-editor .view-lines').first()).not.toContainText(
      'Local changes',
    );
    await switchCrux(page, 'Unfinished thought');
    await expect(page.getByPlaceholder('Send a message...')).toHaveValue(
      'Keep this unsent thought',
    );
  } finally {
    await app.close();
    await api.close();
  }
});
