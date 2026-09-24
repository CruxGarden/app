import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('Garden Home, recursive Navigator, shared Cruxes and outside agents use the same graph', async () => {
  test.setTimeout(150_000);
  let instance = await launchApp();
  const dir = instance.dir;
  let client: Client | undefined;
  try {
    await enterGarden(instance.page);
    const { page } = instance;
    await expect(page.getByRole('button', { name: 'Garden Home', exact: true })).toHaveText(
      'My Garden',
    );
    await expect.poll(() => new URL(page.url()).searchParams.get('garden')).not.toBeNull();
    const rootId = new URL(page.url()).searchParams.get('garden')!;
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Observatory');
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(`
      CREATE TRIGGER garden_workspace_refusal BEFORE INSERT ON dimensions
      WHEN NEW.type = 'garden' AND NEW.kind = 'membership'
      BEGIN SELECT RAISE(ABORT, 'Membership temporarily unavailable'); END
    `),
    );
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Membership temporarily unavailable');
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE title = 'Observatory'"),
      ),
    ).toEqual([]);
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run('DROP TRIGGER garden_workspace_refusal'),
    );
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden Home', exact: true })).toHaveText(
      'Observatory',
    );
    const childId = new URL(page.url()).searchParams.get('garden')!;
    expect(childId).not.toBe(rootId);
    const project = await createCrux(page, 'Night atlas');
    expect(new URL(page.url()).searchParams.get('garden')).toBe(childId);
    await page.getByRole('button', { name: 'Garden Home', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Night atlas', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    const nav = page.getByRole('complementary', { name: 'Navigator' });
    await nav.getByRole('button', { name: 'My Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Observatory', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Night atlas', exact: true })).toHaveCount(
      0,
    );

    await page.getByRole('button', { name: 'Switch Crux workspace', exact: true }).click();
    const switcher = page.getByRole('dialog', { name: 'Switch Crux workspace', exact: true });
    await expect(switcher.getByRole('button', { name: /Night atlas/ })).toHaveCount(0);
    await switcher.getByRole('button', { name: 'Cancel', exact: true }).click();

    // An explicit second membership shares one identity, not a copy.
    await page.getByRole('button', { name: 'Add existing Crux', exact: true }).click();
    await page.getByRole('button', { name: 'Add Night atlas to this Garden', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const card = page.getByRole('button', { name: 'Open Night atlas', exact: true }).locator('..');
    await card.hover();
    await card.getByRole('button', { name: 'Crux actions' }).click();
    await page.getByRole('menuitem', { name: 'Remove from Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Night atlas', exact: true })).toHaveCount(
      0,
    );
    await nav.getByRole('button', { name: 'Observatory', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Night atlas', exact: true })).toBeVisible();

    // Supporting surfaces are panels; Home and Navigator remain interactive.
    await page.keyboard.press('ControlOrMeta+,');
    const settings = page.getByRole('region', { name: 'Settings', exact: true });
    await expect(settings).toBeVisible();
    await expect(nav).toBeVisible();
    await settings
      .getByRole('switch', { name: 'Agent access for Whole garden', exact: true })
      .click();
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    client = new Client({ name: 'garden-graph-proof', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      return (result.content as { text: string }[]).map((item) => item.text).join('\n');
    };
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    const inspected = JSON.parse(
      await call('garden_graph', { action: 'inspect', gardenId: childId }),
    );
    expect(inspected.members.map((row: { id: string }) => row.id)).toContain(project);
    const agentGarden = JSON.parse(
      await call('garden_graph', { action: 'create', gardenId: childId, title: 'Darkroom' }),
    );
    await call('plant_crux', { title: 'Agent study', gardenId: agentGarden.id, template: 'blank' });
    await call('garden_graph', { action: 'open', gardenId: agentGarden.id });
    await expect(page.getByRole('button', { name: 'Garden Home', exact: true })).toHaveText(
      'Darkroom',
    );
    await expect(page.getByRole('button', { name: 'Open Agent study', exact: true })).toBeVisible();
    expect(page.url()).not.toContain(childId);
    await expect(nav.getByRole('button', { name: 'Darkroom', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Moving Gardens does not discard the original open workspace.
    await nav.getByRole('button', { name: 'Observatory', exact: true }).click();
    await page.getByRole('button', { name: 'Switch Crux workspace', exact: true }).click();
    await expect(
      switcher.getByRole('button', { name: 'Close Night atlas workspace', exact: true }),
    ).toBeVisible();
    await switcher.getByRole('button', { name: 'Cancel', exact: true }).click();
    await nav.getByRole('button', { name: 'Darkroom', exact: true }).click();
    await page.screenshot({ path: 'e2e/.results/garden-workspace.png' });
    await client.close();
    client = undefined;
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await expect(
      instance.page.getByRole('button', { name: 'Open Observatory', exact: true }),
    ).toBeVisible();
    await instance.page.getByRole('button', { name: 'Open Observatory', exact: true }).click();
    await expect(
      instance.page.getByRole('button', { name: 'Open Night atlas', exact: true }),
    ).toBeVisible();
    await instance.page.getByRole('button', { name: 'Open Darkroom', exact: true }).click();
    await expect(
      instance.page.getByRole('button', { name: 'Open Agent study', exact: true }),
    ).toBeVisible();
  } finally {
    await client?.close().catch(() => {});
    await instance.app.close().catch(() => {});
  }
});
