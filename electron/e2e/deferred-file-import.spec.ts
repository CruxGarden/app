import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { togglePanel } from './panel-helpers';

test('a queued document import survives closing Workshop, changing Gardens and restarting', async () => {
  test.setTimeout(180_000);
  let instance = await launchApp();
  const dir = instance.dir;
  try {
    const { page } = instance;
    await enterGarden(page);
    const root = new URL(page.url()).searchParams.get('garden')!;
    // Hold the real readiness grace period long enough to close the actual panel.
    await page.evaluate(() => {
      const original = window.setTimeout;
      window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
        original(handler, ms === 1500 ? 15000 : ms, ...args)) as typeof window.setTimeout;
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'crux:notebook') document.body.dataset.notebookSpoke = 'true';
      });
    });
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Start from a file…', exact: true }).click();
    await (await chooser).setFiles(resolve(__dirname, 'fixtures/documents/Letter.docx'));
    await expect(page.locator('[data-workspace-id]')).toBeVisible({ timeout: 60_000 });
    const id = (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!;
    const folder = (await storedCrux(page, id)).projectFolder;
    await expect(page.locator('body')).toHaveAttribute('data-notebook-spoke', 'true');
    await togglePanel(page, 'Toggle workshop');
    await expect(page.locator('iframe[data-crux-id]')).toHaveCount(0);
    const pending = (await page.evaluate(
      async (id) =>
        window.electronAPI!.sqlite.get('SELECT value FROM settings WHERE key = ?', [
          `cruxgarden:pending-open:${id}`,
        ]),
      id,
    )) as { value: string } | undefined;
    expect(pending, 'Closing before dispatch must retain the import request').toBeDefined();
    expect(existsSync(join(folder, 'notebook/Imported/Letter/Letter.md'))).toBe(false);
    await page.getByRole('button', { name: 'Garden Home', exact: true }).click();
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Other work');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden Home', exact: true })).toHaveText(
      'Other work',
    );
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await expect.poll(() => new URL(instance.page.url()).searchParams.get('garden')).toBe(root);
    await instance.page.getByRole('button', { name: 'Open Letter', exact: true }).click();
    await togglePanel(instance.page, 'Toggle workshop');
    await expect
      .poll(() => existsSync(join(folder, 'notebook/Imported/Letter/Letter.md')), {
        timeout: 90_000,
      })
      .toBe(true);
    expect(readFileSync(join(folder, 'notebook/Imported/Letter/Letter.md'), 'utf8')).toContain(
      'LETTER_BODY_SENTINEL',
    );
    const record = async () =>
      instance.page.evaluate(async (id) => {
        const row = (await window.electronAPI!.sqlite.get(
          'SELECT value FROM settings WHERE key = ?',
          [`cruxgarden:pending-open:${id}`],
        )) as { value: string };
        return JSON.parse(row.value);
      }, id);
    await expect.poll(async () => (await record()).state).toBe('complete');
    const inventory = readdirSync(join(folder, 'notebook/Imported'));
    await togglePanel(instance.page, 'Toggle workshop');
    await togglePanel(instance.page, 'Toggle workshop');
    await expect(instance.page.locator('iframe[data-crux-id]')).toBeVisible();
    // Simulate a process which lost the acknowledgement after the tool wrote its output.
    const completed = await record();
    await instance.page.evaluate(
      async ({ id, completed }) =>
        window.electronAPI!.sqlite.run('UPDATE settings SET value = ? WHERE key = ?', [
          JSON.stringify({ ...completed, state: 'dispatched' }),
          `cruxgarden:pending-open:${id}`,
        ]),
      { id, completed },
    );
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await instance.page.getByRole('button', { name: 'Open Letter', exact: true }).click();
    const notice = instance.page.getByRole('status', { name: 'File import', exact: true });
    await expect(notice).toContainText('may already have imported');
    await expect(notice.getByRole('button', { name: 'Retry import', exact: true })).toBeVisible();
    await expect(
      instance.page.frameLocator('iframe[data-crux-id]').locator('.tiptap').first(),
    ).toBeVisible({ timeout: 60_000 });
    expect((await record()).state).toBe('dispatched');
    await instance.page.screenshot({ path: 'e2e/.results/deferred-import-recovery.png' });
    await instance.page.keyboard.press('ControlOrMeta+,');
    await instance.page
      .getByRole('switch', { name: 'Agent access for Whole garden', exact: true })
      .click();
    const configPath = join(dir, 'userData/garden-agent-host/.crux/mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const client = new Client({ name: 'import-recovery-proof', version: '1' });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
        }),
      );
      const inspect = await client.callTool({
        name: 'file_import',
        arguments: { cruxId: id, action: 'inspect' },
      });
      expect(inspect.isError).not.toBe(true);
      expect(JSON.stringify(inspect.content)).toContain('dispatched');
      await instance.page.getByRole('button', { name: 'Close Settings', exact: true }).click();
      await notice.getByRole('button', { name: 'Dismiss', exact: true }).click();
      await expect(notice).toHaveCount(0);
      const dismissed = await client.callTool({
        name: 'file_import',
        arguments: { cruxId: id, action: 'inspect' },
      });
      expect(JSON.stringify(dismissed.content)).toContain('dismissed');
    } finally {
      await client.close();
    }
    expect(readdirSync(join(folder, 'notebook/Imported'))).toEqual(inventory);
  } finally {
    await instance.app.close().catch(() => {});
  }
});
