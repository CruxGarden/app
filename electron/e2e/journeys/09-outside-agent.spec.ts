import { addGardenConnection } from '../connection-helpers';
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { enableAdvancedMode, showPane, hidePane } from '../panel-helpers';

/** An outside agent (over MCP) and the app see the same Garden. */
test('an outside agent plants a Crux the app shows', async () => {
  test.setTimeout(120_000);
  const { app, page } = await launchApp();
  let client: Client | undefined;
  try {
    await enterGarden(page);
    await enableAdvancedMode(page);
    await showPane(page, 'Settings');
    const config = await addGardenConnection(page);
    await hidePane(page, 'Settings');
    client = new Client({ name: 'journey', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const gardenId = new URL(page.url()).searchParams.get('garden')!;
    const result = await client.callTool({
      name: 'plant_crux',
      arguments: { title: 'Agent study', gardenId, template: 'blank' },
    });
    expect(result.isError).not.toBe(true);
    await expect(page.getByRole('button', { name: 'Open Agent study', exact: true })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await client?.close().catch(() => {});
    await app.close();
  }
});
