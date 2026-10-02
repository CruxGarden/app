import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import { enterGarden, createCrux, storedCrux } from './multi-crux-helpers';
import { openPanel } from './panel-helpers';
import { writeFirstFile, connectAccount } from './journeys/journey-helpers';

const text = (result: unknown) =>
  (result as { content: { text?: string }[] }).content.map((part) => part.text ?? '').join('\n');

test('source save refusal retains the draft; UI retry and Garden agent sharing publish the visible bytes', async () => {
  test.setTimeout(150_000);
  const api = await startMockApi();
  const instance = await launchApp({ env: { CRUX_API_URL: api.url } });
  const { page } = instance;
  let client: Client | undefined;
  try {
    await enterGarden(page);
    await page.keyboard.press('ControlOrMeta+,');
    const navigation = page.getByRole('navigation', { name: 'Settings sections' });
    await navigation.getByRole('button', { name: 'AI and agents', exact: true }).click();
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    await navigation.getByRole('button', { name: 'Account', exact: true }).click();
    await connectAccount(page);
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    const id = await createCrux(page, 'Visible source');
    const folder = (await storedCrux(page, id)).projectFolder;
    const editor = await writeFirstFile(page, 'index.html', '<h1>Saved</h1>');
    const edit = async (content: string) => {
      await editor.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await expect(editor.locator('.view-lines')).toHaveText('');
      await page.keyboard.insertText(content);
      await expect(editor).toContainText(content.replace(/<[^>]+>/g, ''));
    };
    await edit('<h1>Retained draft</h1>');
    // The actual local API must refuse before recording a new content head.
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(
        "CREATE TRIGGER refuse_publication_source BEFORE UPDATE ON file_content_heads BEGIN SELECT RAISE(ABORT, 'Source save refused'); END",
      ),
    );
    const share = await openPanel(page, 'publish', 'Toggle share');
    await share.getByRole('button', { name: 'Share', exact: true }).click();
    const warning = page
      .getByRole('dialog')
      .filter({ hasText: 'A published site is not a backup' });
    await warning.getByRole('button', { name: 'Share without a backup' }).click();
    await expect(share.getByRole('alert')).toBeVisible();
    expect(Object.keys(api.state.published)).toHaveLength(0);
    await expect(editor).toContainText('Retained draft');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run('DROP TRIGGER refuse_publication_source'),
    );
    await share
      .getByRole('button', { name: /Retry|Share/, exact: false })
      .first()
      .click();
    if (await warning.isVisible())
      await warning.getByRole('button', { name: 'Share without a backup' }).click();
    await expect(page.getByText('Up to date')).toBeVisible();
    expect(
      api.state.published[id].find((file) => file.path === 'index.html')?.bytes.toString(),
    ).toBe('<h1>Retained draft</h1>');
    expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe('<h1>Retained draft</h1>');

    const config = JSON.parse(
      readFileSync(
        join(instance.dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json'),
        'utf8',
      ),
    );
    client = new Client({ name: 'source-publication-proof', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    for (const name of ['publish_crux', 'call_crux_tool']) {
      const content = `<h1>Visible ${name} draft</h1>`;
      await edit(content);
      const operation = client.callTool({
        name,
        arguments:
          name === 'publish_crux' ? { cruxId: id } : { cruxId: id, name: 'publish', input: {} },
      });
      const approvals = page.getByTestId('agent-approvals');
      await expect(approvals).toContainText('wants to publish');
      await approvals.getByRole('button', { name: 'Publish', exact: true }).click();
      const result = await operation;
      expect(result.isError, text(result)).not.toBe(true);
      expect(text(result)).toContain('Published');
      expect(
        api.state.published[id].find((file) => file.path === 'index.html')?.bytes.toString(),
      ).toBe(content);
      expect(readFileSync(join(folder, 'index.html'), 'utf8')).toBe(content);
    }
  } finally {
    await client?.close();
    await instance.app.close();
    await api.close();
  }
});
