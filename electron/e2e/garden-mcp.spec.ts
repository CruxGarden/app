import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

const text = (result: unknown) =>
  (result as { content: Array<{ text?: string }> }).content.map((c) => c.text ?? '').join('\n');
async function connect(config: { url: string; token: string }) {
  const client = new Client({ name: 'outside-gardener', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
    }),
  );
  return client;
}

test('an outside MCP client operates across the garden; built-in collaborators share the tools', async () => {
  test.setTimeout(120_000);
  const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  let client: Client | undefined;
  const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
  try {
    await enterGarden(page);
    await page.keyboard.press('ControlOrMeta+,');
    const toggle = page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect.poll(() => existsSync(configPath)).toBe(true);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    client = await connect(config);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client!.callTool({ name, arguments: args });
      expect(result.isError, text(result)).not.toBe(true);
      return text(result);
    };
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('plant_crux');
    expect(names).toContain('call_crux_tool');
    expect(names).not.toContain('answer_approval');
    // Garden panels close with their own control; a later Cmd+, reopens Settings.
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    const a = /id: (\S+)/.exec(
      await call('plant_crux', { title: 'Outside alpha', template: 'blank' }),
    )![1];
    const b = /id: (\S+)/.exec(
      await call('plant_crux', { title: 'Outside beta', template: 'blank' }),
    )![1];
    await call('create_cruxspace', {
      name: 'Outside study',
      brief: 'Shared creative work',
      cruxIds: [a, b],
    });
    expect(await call('list_cruxspaces')).toContain('Outside study');
    expect(await call('list_templates')).toContain('small-game');
    const undertaking = await call('create_cruxspace', {
      name: 'Outside pocket game',
      templateId: 'small-game',
      exampleMode: 'start',
    });
    const undertakingId = /id: (\S+)/.exec(undertaking)![1];
    expect(undertaking).not.toContain('worked example');
    // The undertaking is a Garden holding its two Cruxes.
    const members = await page.evaluate(
      async (id) =>
        (await window.electronAPI!.sqlite.gardenMembership!.list(id, { limit: 100 })).items,
      undertakingId,
    );
    expect(members).toHaveLength(2);
    expect(
      await call('call_crux_tool', {
        cruxId: members.find((m) => !/notebook/i.test(m.title ?? ''))!.id,
        name: 'read_file',
        input: { path: 'game.json' },
      }),
    ).toContain('Firefly Catch');

    const defs = JSON.parse(await call('list_crux_tools', { cruxId: a }));
    expect(defs.some((t: { name: string }) => t.name === 'write_file')).toBe(true);
    await call('call_crux_tool', {
      cruxId: a,
      name: 'write_file',
      input: { path: 'alpha.txt', content: 'Outside contribution' },
    });
    expect(
      await call('call_crux_tool', { cruxId: b, name: 'list_files', input: {} }),
    ).not.toContain('alpha.txt');
    expect(
      await call('call_crux_tool', { cruxId: a, name: 'read_file', input: { path: 'alpha.txt' } }),
    ).toContain('Outside contribution');
    await call('snapshot_crux', { cruxId: a, label: 'Outside checkpoint' });
    await call('show', { what: 'crux', cruxId: a });
    await expect(page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'Outside alpha',
    );
    // A real built-in Collaboration loop uses the shared discovery/executor.
    await page.getByPlaceholder('Send a message...').fill('[garden:companion]');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
      page.getByText('Done — planted a companion Crux from this Collaboration.'),
    ).toBeVisible();
    expect(await call('list_cruxes')).toContain('Built-in companion');
    await page.screenshot({ path: 'e2e/.results/garden-mcp-workflow.png' });
    // A narrow token cannot escalate by guessing the garden tool's name.
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('switch', { name: 'Agent access for Outside alpha', exact: true }).click();
    const narrowConfig = await page.evaluate(
      async (id) => (await window.electronAPI!.agentHost.list()).find((s) => s.cruxId === id)!,
      a,
    );
    const narrow = await connect(narrowConfig);
    try {
      expect((await narrow.listTools()).tools.some((t) => t.name === 'call_garden_tool')).toBe(
        false,
      );
      expect(
        (
          await narrow.callTool({
            name: 'call_garden_tool',
            arguments: { name: 'plant_crux', input: { title: 'Must not exist' } },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await narrow.close();
    }
    expect(await call('list_cruxes')).not.toContain('Must not exist');
    await client.close();
    client = undefined;
    await app.close();
    const again = await launchApp({ dir });
    try {
      await again.page.getByRole('button', { name: /enter/i }).click();
      await expect(
        again.page.getByRole('button', { name: 'Switch Crux workspace', exact: true }),
      ).toBeVisible();
      const restored = JSON.parse(readFileSync(configPath, 'utf8'));
      expect(restored.token === config.token).toBe(true);
      client = await connect(restored);
      expect(text(await client.callTool({ name: 'list_cruxes', arguments: {} }))).toContain(
        'Outside beta',
      );
      await client.close();
      client = undefined;
      await again.page.keyboard.press('ControlOrMeta+,');
      const gardenPanel = again.page.getByTestId('agents-garden-access');
      await gardenPanel.getByRole('button', { name: 'Connect', exact: true }).click();
      await gardenPanel.getByRole('button', { name: 'Regenerate token' }).click();
      await expect
        .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).token !== config.token)
        .toBe(true);
      const rotated = JSON.parse(readFileSync(configPath, 'utf8'));
      const denied = await fetch(rotated.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(denied.status).toBe(401);
      await again.page
        .getByRole('switch', { name: 'Agent access for Whole garden', exact: true })
        .click();
      await expect.poll(() => existsSync(configPath)).toBe(false);
    } finally {
      await client?.close().catch(() => {});
      client = undefined;
      await again.app.close();
    }
  } finally {
    await client?.close().catch(() => {});
    await app.close().catch(() => {});
  }
});
