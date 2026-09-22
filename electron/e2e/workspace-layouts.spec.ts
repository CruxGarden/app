import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden, createCrux, switchCrux } from './multi-crux-helpers';

test('saved layouts are shared by UI and outside agents, reusable across Cruxes and retained after restart', async () => {
  test.setTimeout(120000);
  const first = await launchApp();
  const { page, dir } = first;
  let client: Client | undefined;
  try {
    await enterGarden(page);
    await createCrux(page, 'Writing');
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    client = new Client({ name: 'layout-gardener', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const call = async (args: Record<string, unknown>) => {
      const result = await client!.callTool({ name: 'workspace_layouts', arguments: args });
      const text = (result.content as { text?: string }[]).map((c) => c.text ?? '').join('\n');
      expect(result.isError, text).not.toBe(true);
      return JSON.parse(text);
    };
    const settings = page.getByRole('region', { name: 'Workspace layouts', exact: true });
    await settings.getByRole('textbox', { name: 'Workspace layout name' }).fill('Original');
    await settings.getByRole('button', { name: 'Save workspace layout', exact: true }).click();
    const original = (await call({ action: 'list' })).current;
    expect((await call({ action: 'list' })).layouts).toContainEqual({
      name: 'Original',
      layout: original,
    });
    await call({ action: 'save', name: 'Writing desk', layout: 'collaboration' });
    await settings.getByRole('button', { name: 'Apply workspace layout Writing desk' }).click();
    expect((await call({ action: 'list' })).current).toBe('collaboration');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pane-body-collaboration')).toBeVisible();
    await expect(page.getByTestId('pane-body-artifacts')).toHaveCount(0);
    const composer = page.locator('[data-testid="pane-body-collaboration"] textarea').first();
    await composer.fill('An unsent idea that must survive');
    await createCrux(page, 'Research');
    await call({ action: 'apply', name: 'Writing desk' });
    await expect(page.getByTestId('pane-body-collaboration')).toBeVisible();
    await switchCrux(page, 'Writing');
    await expect(composer).toHaveValue('An unsent idea that must survive');
    await call({ action: 'apply', name: 'Original' });
    expect((await call({ action: 'list' })).current).toEqual(original);
    await page.keyboard.press('ControlOrMeta+,');
    await settings.getByRole('button', { name: 'Delete workspace layout Original' }).click();
    expect((await call({ action: 'list' })).layouts.map((x: { name: string }) => x.name)).toEqual([
      'Writing desk',
    ]);
  } finally {
    await client?.close();
    await first.app.close();
  }
  const second = await launchApp({ dir });
  try {
    await second.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(second.page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Writing',
    );
    await second.page.keyboard.press('ControlOrMeta+,');
    await expect(
      second.page.getByRole('button', { name: 'Apply workspace layout Writing desk' }),
    ).toBeVisible();
    await expect(
      second.page.getByRole('button', { name: 'Apply workspace layout Original' }),
    ).toHaveCount(0);
  } finally {
    await second.app.close();
  }
});
