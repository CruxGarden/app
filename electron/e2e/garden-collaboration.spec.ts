import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden, storedCrux } from './multi-crux-helpers';

test('Garden Collaboration owns history, drafts and background work across navigation, failed saves, MCP and restart', async () => {
  test.setTimeout(150_000);
  let instance = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  const dir = instance.dir;
  let client: Client | undefined;
  try {
    let { page } = instance;
    await enterGarden(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('garden')).not.toBeNull();
    const rootId = new URL(page.url()).searchParams.get('garden')!;
    await page.keyboard.press('ControlOrMeta+,');
    const settings = page.getByRole('region', { name: 'Settings', exact: true });
    await settings
      .getByRole('switch', { name: 'Agent access for Whole garden', exact: true })
      .click();
    await page.locator('h2', { hasText: /^AI$/ }).click();
    await page.getByRole('switch', { name: 'Enable AI Tools' }).click();
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Console', exact: true }).click();
    const rootPanel = () =>
      page.getByRole('region', { name: 'My Garden · Collaboration', exact: true });
    await expect(rootPanel().getByPlaceholder('Send a message...')).toBeEnabled();
    await page.evaluate(() => {
      document.documentElement.dataset.keeperPaused = '';
      window.addEventListener(
        'crux:mock-pause',
        () => {
          document.documentElement.dataset.keeperPaused = 'yes';
        },
        { once: true },
      );
    });
    await rootPanel()
      .getByPlaceholder('Send a message...')
      .fill('[garden:owned-turn] Make a companion');
    await rootPanel().getByPlaceholder('Send a message...').press('Enter');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.keeperPaused))
      .toBe('yes');
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Writing');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    const childPanel = () =>
      page.getByRole('region', { name: 'Writing · Collaboration', exact: true });
    await expect(childPanel().getByPlaceholder('Send a message...')).toBeEnabled();
    const childId = new URL(page.url()).searchParams.get('garden')!;
    await expect(childPanel()).not.toContainText('Make a companion');
    await childPanel().getByPlaceholder('Send a message...').fill('My separate Writing draft');
    await page.evaluate(() => window.dispatchEvent(new Event('crux:mock-continue')));
    await expect
      .poll(async () => JSON.stringify((await storedCrux(page, rootId)).gardenCollaboration))
      .toContain('Done — created in the original Garden.');
    await expect(childPanel().getByPlaceholder('Send a message...')).toHaveValue(
      'My separate Writing draft',
    );
    const memberships = await page.evaluate(() =>
      window.electronAPI!.sqlite.all(
        `SELECT d.source_id FROM dimensions d JOIN cruxes c ON c.id = d.target_id WHERE c.title = 'Studio companion' AND d.kind = 'membership'`,
      ),
    );
    expect(memberships).toEqual([{ source_id: rootId }]);
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    const nav = () => page.getByRole('complementary', { name: 'Navigator' });
    await nav().getByRole('button', { name: 'My Garden', exact: true }).click();
    await expect(rootPanel()).toContainText('Done — created in the original Garden.');
    await nav().getByRole('button', { name: 'Writing', exact: true }).click();
    await expect(childPanel().getByPlaceholder('Send a message...')).toHaveValue(
      'My separate Writing draft',
    );
    await nav().getByRole('button', { name: 'My Garden', exact: true }).click();

    // Actual API-owner refusal: no provider call should erase the original draft.
    await page.evaluate(
      (id) =>
        window.electronAPI!.sqlite.run(
          `CREATE TRIGGER refuse_garden_chat BEFORE UPDATE ON cruxes WHEN OLD.id = '${id}' BEGIN SELECT RAISE(ABORT, 'Conversation disk refusal'); END`,
        ),
      rootId,
    );
    await rootPanel().getByPlaceholder('Send a message...').fill('Keep my unsaved thought');
    await rootPanel().getByPlaceholder('Send a message...').press('Enter');
    await expect(rootPanel().getByRole('alert')).toContainText('Conversation disk refusal');
    await expect(rootPanel().getByPlaceholder('Send a message...')).toHaveValue(
      'Keep my unsaved thought',
    );
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_garden_chat'));
    await rootPanel().getByRole('button', { name: 'Retry save' }).click();
    await expect(rootPanel().getByRole('alert')).toHaveCount(0);

    // An authenticated outside agent uses the same owner-bound controls.
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    client = new Client({ name: 'garden-collaboration-proof', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const call = async (args: Record<string, unknown>) => {
      const result = await client!.callTool({ name: 'garden_collaboration', arguments: args });
      expect(result.isError).not.toBe(true);
      const text = (result.content as { text: string }[]).map((c) => c.text).join('\n');
      return JSON.parse(text);
    };
    const rootHistory = await call({ gardenId: rootId, action: 'inspect' });
    expect(JSON.stringify(rootHistory.conversations)).toContain('Keep my unsaved thought');
    const childHistory = await call({ gardenId: childId, action: 'inspect' });
    expect(childHistory.conversations).toEqual([]);
    await call({ gardenId: childId, action: 'send', message: 'A private Writing conversation' });
    await expect
      .poll(async () => (await call({ gardenId: childId, action: 'inspect' })).streaming)
      .toBe(false);
    await nav().getByRole('button', { name: 'Writing', exact: true }).click();
    await expect(childPanel()).toContainText('A private Writing conversation');
    await expect(childPanel()).not.toContainText('Keep my unsaved thought');
    const wrapped = await client.callTool({
      name: 'call_garden_tool',
      arguments: { name: 'garden_collaboration', input: { gardenId: childId, action: 'inspect' } },
    });
    expect(wrapped.isError).not.toBe(true);
    expect(JSON.stringify((await storedCrux(page, rootId)).gardenCollaboration)).not.toContain(
      'A private Writing conversation',
    );
    await expect(childPanel().getByPlaceholder('Send a message...')).toHaveValue(
      'My separate Writing draft',
    );
    await page.screenshot({ path: 'e2e/.results/garden-collaboration.png' });
    await client.close();
    client = undefined;
    await instance.app.close();
    instance = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
    const button = page.getByRole('button', { name: 'Console', exact: true });
    if (!(await rootPanel().isVisible())) await button.click();
    await expect(rootPanel()).toContainText('Keep my unsaved thought');
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await nav().getByRole('button', { name: 'Writing', exact: true }).click();
    await expect(childPanel()).toContainText('A private Writing conversation');
    expect(JSON.stringify((await storedCrux(page, rootId)).gardenCollaboration)).toContain(
      'Done — created in the original Garden.',
    );
    expect(JSON.stringify((await storedCrux(page, childId)).gardenCollaboration)).not.toContain(
      'Keep my unsaved thought',
    );
    // The real window-close path must stop and persist a Garden turn too.
    await page.evaluate(() => {
      document.documentElement.dataset.keeperPaused = '';
      window.addEventListener(
        'crux:mock-pause',
        () => {
          document.documentElement.dataset.keeperPaused = 'yes';
        },
        { once: true },
      );
    });
    await childPanel()
      .getByPlaceholder('Send a message...')
      .fill('[garden:owned-turn] Stop this one at exit');
    await childPanel().getByPlaceholder('Send a message...').press('Enter');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.keeperPaused))
      .toBe('yes');
    await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    const closeDialog = page.getByRole('dialog', { name: 'Close Crux Garden' });
    await expect(closeDialog).toBeVisible();
    await closeDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(childPanel().getByTestId('keeper-status')).toBeVisible();
    await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    const closed = instance.app.waitForEvent('close');
    await page.getByRole('button', { name: 'Save and exit', exact: true }).click();
    await closed;
    instance = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
    page = instance.page;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add Crux' })).toBeVisible();
    if (!(await rootPanel().isVisible()))
      await page.getByRole('button', { name: 'Console', exact: true }).click();
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await nav().getByRole('button', { name: 'Writing', exact: true }).click();
    await expect(childPanel()).toContainText('Stopped here by the person');
    await expect(childPanel().getByTestId('keeper-status')).toHaveCount(0);
    const allCompanions = await page.evaluate(() =>
      window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE title = 'Studio companion'"),
    );
    expect(allCompanions).toHaveLength(1);
  } finally {
    await client?.close();
    await instance.app.close();
  }
});
