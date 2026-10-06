import { openSetupWizard } from './setup-helpers';
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';
import { enableAdvancedMode, showPane, hidePane } from './panel-helpers';
import { addGardenConnection } from './connection-helpers';

test('named connection checks scopes, survives restart and revokes its old token', async () => {
  test.setTimeout(150_000);
  const first = await launchApp();
  let client: Client | undefined;
  let secret: { url: string; token: string };
  const connect = async (config: { url: string; token: string }) => {
    const c = new Client({ name: 'scope acceptance', version: '1' });
    await c.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    return c;
  };
  try {
    const { page } = first;
    await enterGarden(page);
    await enableAdvancedMode(page);
    await showPane(page, 'Settings');
    await page
      .getByRole('region', { name: 'Whole garden connections' })
      .getByRole('switch', { name: 'Create and edit', exact: true })
      .click();
    secret = await addGardenConnection(page, 'Read only');
    await hidePane(page, 'Settings');
    client = await connect(secret);
    expect(
      (
        await client.callTool({
          name: 'plant_crux',
          arguments: { title: 'Refused', template: 'blank' },
        })
      ).isError,
    ).toBe(true);
    await showPane(page, 'Settings');
    const connection = page.getByTestId('agent-connection');
    await connection.getByText('Edit permissions', { exact: true }).click();
    await connection
      .getByRole('switch', { name: 'Create and edit for Read only', exact: true })
      .click();
    await expect(
      connection.getByRole('switch', { name: 'Create and edit for Read only', exact: true }),
    ).toBeChecked();
    await hidePane(page, 'Settings');
    expect(
      (
        await client.callTool({
          name: 'plant_crux',
          arguments: { title: 'Allowed', template: 'blank' },
        })
      ).isError,
    ).not.toBe(true);
    await client.close();
    client = undefined;
  } finally {
    await first.app.close();
  }
  const second = await launchApp({ dir: first.dir });
  try {
    await second.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(second.page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
    client = await connect(secret!);
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    await showPane(second.page, 'Settings');
    const row = second.page.getByTestId('agent-connection');
    await row.getByRole('button', { name: 'Replace token', exact: true }).click();
    await expect(second.page.getByTestId('agent-connection-secret')).toBeVisible();
    await client.close().catch(() => {});
    client = undefined;
    let refused = false;
    try {
      client = await connect(secret!);
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
    await row.getByRole('button', { name: 'Remove connection', exact: true }).click();
    await expect(row).toHaveCount(0);
    expect(
      await second.page.evaluate(() => window.electronAPI!.agentHost.listConnections()),
    ).toEqual([]);
  } finally {
    await client?.close().catch(() => {});
    await second.app.close();
  }
});

test('the wizard configures an outside agent before the first Crux exists', async () => {
  const { app, page } = await launchApp();
  try {
    const wizard = await openSetupWizard(page);
    await wizard.locator('[data-need="app"]').click();
    await wizard.getByRole('switch', { name: 'Advanced Mode', exact: true }).click();
    await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
    await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
    const outside = page.locator('[data-setup-section="outside"]');
    await outside.getByRole('button', { name: /Set up/ }).click();
    const config = await addGardenConnection(page, 'Wizard agent');
    expect(config.url.startsWith('http://127.0.0.1:')).toBe(true);
    await expect(page.getByTestId('setup-status-outside')).toContainText('1 connection ready');
    await wizard.getByRole('button', { name: 'Skip setup', exact: true }).click();
    await page
      .getByRole('alertdialog', { name: 'Skip setup?' })
      .getByRole('button', { name: 'Skip setup', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Add Crux', exact: true })).toBeVisible();
    await showPane(page, 'Settings');
    await expect(page.getByTestId('agent-connection')).toContainText('Wizard agent');
    await expect(page.getByTestId('agent-connection-secret')).toHaveCount(0);
  } finally {
    await app.close();
  }
});
