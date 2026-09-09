import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * Links that leave the app must reach the system browser. The shell denies
 * window.open and locks its open-external IPC to loopback preview URLs, so an
 * https link routed the wrong way did nothing — the Public Garden button and
 * the Share pane's Open both did, 2026-09-06. shell.openExternal is stubbed in
 * the main process and every click is checked against what it received.
 */
test.describe('links out of the app', () => {
  test.setTimeout(150_000);

  test('Public Garden and the Share pane links open in the browser', async () => {
    const api = await startMockApi();
    const { app, page } = await launchApp({ env: { CRUX_API_URL: api.url } });
    try {
      // Stub the system browser in the main process; record what it is asked to open.
      await app.evaluate(({ shell }) => {
        const g = globalThis as unknown as { __opened: string[] };
        g.__opened = [];
        shell.openExternal = async (url: string) => {
          g.__opened.push(url);
        };
      });
      const opened = () =>
        app.evaluate(() => (globalThis as unknown as { __opened: string[] }).__opened);

      await page.getByRole('button', { name: /enter/i }).click();
      await page.getByText('Plant a new garden').click();
      await page.getByRole('button', { name: 'Welcome' }).click();
      await page.getByRole('button', { name: 'Add Crux' }).click();
      await page.getByRole('button', { name: /^Blank/ }).click();
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'New file' }).click({ timeout: 30_000 });
      const nameInput = page.getByRole('tree').getByRole('textbox');
      await nameInput.fill('index.html');
      await nameInput.press('Enter');
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 30_000 });
      await monaco.click();
      await page.keyboard.type('<h1>Hello</h1>');
      await page.keyboard.press('ControlOrMeta+s');

      // Connect + publish from the Share pane
      await page.getByRole('button', { name: 'Toggle share' }).click();
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      // the first share asks about a backup (RESILIENCE-PLAN §2b); not what this spec is about
      const backupAsk = page
        .getByRole('dialog')
        .filter({ hasText: 'A published site is not a backup' });
      await expect(backupAsk).toBeVisible({ timeout: 30_000 });
      await backupAsk.getByRole('button', { name: 'Share without a backup' }).click();
      await expect(page.getByText('Up to date')).toBeVisible({ timeout: 30_000 });

      // Share pane → Open
      await page.getByRole('link', { name: 'Open' }).click();
      await expect
        .poll(opened)
        .toEqual([expect.stringMatching(/^https:\/\/crux\.garden\/tester\//)]);

      // Home Garden banner → Public Garden
      // The breadcrumb's first segment (the username) is the way home
      await page.getByRole('banner').getByText('tester', { exact: true }).click();
      await page.getByRole('button', { name: 'Public Garden' }).click({ timeout: 30_000 });
      await expect.poll(opened).toHaveLength(2);
      expect((await opened())[1]).toBe('https://crux.garden/tester');
    } finally {
      await app.close();
      await api.close();
    }
  });
});
