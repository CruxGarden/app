import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';

/**
 * Agent Host gate (ADR 0013, phase B2): a REAL MCP client in the test process
 * against the running desktop app.
 *
 *   Blog crux → Settings → Agents → switch on → `.crux/mcp.json` appears
 *   (mode 600) → connect → tools/list has write_file + check_site + publish →
 *   write_file creates a post that shows in the Artifacts tree AND as a tool
 *   message attributed to the agent in the Collaboration → crux://files lists
 *   it → a snapshot the agent takes is stamped requestedBy agent:<name> →
 *   delete_file BLOCKS until the in-app banner is approved → no token = 401,
 *   foreign Host = refused.
 *
 *   Blank crux + mock API → publish via MCP waits for the in-app approval and
 *   then reaches the API; get_usage reads back.
 *
 * Publish runs on a Blank crux because publishing a Site Crux performs a real
 * `astro build` (pnpm install + network), which the e2e suite never does.
 */

interface McpConfig {
  url: string;
  token: string;
  cruxId: string;
  name: string;
  slug: string;
}

const textOf = (result: unknown): string => {
  const r = result as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  return r.content.map((c) => c.text ?? '').join('\n');
};

async function plantGarden(page: Page, template: RegExp) {
  await page.getByRole('button', { name: /enter/i }).click();
  await page.getByText('Plant a new garden').click();
  await page.getByRole('button', { name: 'Welcome' }).click();
  await page.getByRole('button', { name: 'Add Crux' }).click();
  await page.getByRole('button', { name: template }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
}

/** Settings → Agents: switch the (only) crux on, read back the config the app wrote. */
async function enableAgentHost(page: Page, gardenRoot: string): Promise<McpConfig> {
  await page.keyboard.press('ControlOrMeta+,');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const agents = page.getByTestId('agents-settings');
  await expect(agents.getByRole('heading', { name: 'Agents' })).toBeVisible();
  await expect(agents.getByTestId('agents-trust')).toContainText(/wait for your approval/);
  await expect(agents).toContainText('no servers running');

  const toggle = agents.getByRole('switch').first();
  await expect(toggle).toHaveAttribute('aria-checked', 'false'); // off by default
  await toggle.click();
  await expect(agents.getByTestId('agents-connect')).toBeVisible({ timeout: 30_000 });
  await expect(agents).toContainText('1 server running');

  const configPath = () => join(gardenRoot, readdirSync(gardenRoot)[0]!, '.crux', 'mcp.json');
  await expect.poll(() => existsSync(configPath())).toBe(true);
  const config = JSON.parse(readFileSync(configPath(), 'utf8')) as McpConfig;
  expect(config.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  expect(config.token.length).toBeGreaterThanOrEqual(40);
  expect(statSync(configPath()).mode & 0o777).toBe(0o600);

  // The Connect panel hands the user the exact command
  const snippet = agents.getByTestId('agents-snippet');
  await expect(snippet).toContainText(`claude mcp add --transport http crux-${config.slug}`);
  await expect(snippet).toContainText(config.url);
  await expect(snippet).toContainText(config.token);
  await agents.getByRole('button', { name: 'Codex' }).click();
  await expect(snippet).toContainText(`[mcp_servers.crux-${config.slug}]`);
  await agents.getByRole('button', { name: 'Cursor' }).click();
  await expect(snippet).toContainText('"mcpServers"');
  await page.screenshot({ path: 'e2e/.results/mcp-1-settings.png' });

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
  return config;
}

async function connect(config: McpConfig, name: string): Promise<Client> {
  const client = new Client({ name, version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
  });
  await client.connect(transport);
  return client;
}

/** Raw request with full control over headers (fetch drops a custom Host). */
function rawPost(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpRequest(
      {
        host: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'probe', version: '0' },
  },
};

test.describe('Agent Host (MCP server per crux)', () => {
  test.setTimeout(4 * 60_000);

  test('Blog crux: enable, connect, write, attribute, snapshot, approve a delete, refuse strangers', async () => {
    const { app, page, dir } = await launchApp();
    const gardenRoot = join(dir, 'garden');
    const folder = () => join(gardenRoot, readdirSync(gardenRoot)[0]!);
    let client: Client | null = null;
    try {
      await plantGarden(page, /Astro Blog/);
      await expect(page.getByRole('button', { name: /new post/i })).toBeVisible({
        timeout: 30_000,
      });

      const config = await enableAgentHost(page, gardenRoot);
      client = await connect(config, 'e2e-agent');

      // ── tools/list: the collaborator's tools plus the product actions ──────
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'write_file',
          'read_file',
          'delete_file',
          'check_site',
          'snapshot',
          'publish',
          'unpublish',
          'get_usage',
        ]),
      );

      // ── resources/list ─────────────────────────────────────────────────────
      const { resources } = await client.listResources();
      expect(resources.map((r) => r.uri)).toContain('crux://files');
      const persona = JSON.parse(
        (await client.readResource({ uri: 'crux://persona' })).contents[0]!.text as string,
      ) as { name: string };
      expect(persona.name.length).toBeGreaterThan(0);

      // ── write_file → disk, Artifacts tree, Collaboration ───────────────────
      const post = 'src/pages/posts/hello-from-mcp.md';
      const written = await client.callTool({
        name: 'write_file',
        arguments: {
          path: post,
          content:
            '---\ntitle: Hello from MCP\ndate: 2026-09-04\ndescription: Written by an external agent\n---\n\nAn external agent wrote this post over MCP.\n',
        },
      });
      expect(written.isError ?? false).toBe(false);
      expect(textOf(written)).not.toMatch(/^Error/);
      await expect.poll(() => existsSync(join(folder(), post))).toBe(true);

      // Attributed in the Collaboration: a tool message carrying the agent's name
      await expect(page.getByText('agent:e2e-agent').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/hello-from-mcp\.md/).first()).toBeVisible();

      // In the Artifacts tree (the writing layout keeps it one toggle away)
      await page.getByRole('button', { name: 'Toggle artifacts' }).click();
      const tree = page.getByRole('tree');
      await expect(tree).toBeVisible({ timeout: 30_000 });
      for (const dirName of ['src', 'pages', 'posts']) {
        await tree.getByText(dirName, { exact: true }).click();
      }
      await expect(tree.getByText('hello-from-mcp.md', { exact: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/.results/mcp-2-written.png' });

      // ── crux://files lists it ──────────────────────────────────────────────
      const files = JSON.parse(
        (await client.readResource({ uri: 'crux://files' })).contents[0]!.text as string,
      ) as { files: Array<{ path: string }> };
      expect(files.files.map((f) => f.path)).toContain(post);

      // ── a snapshot the agent takes is attributed to it (B0 tool + ADR 0013) ─
      const snap = await client.callTool({
        name: 'snapshot',
        arguments: { label: 'From MCP' },
      });
      expect(textOf(snap)).not.toMatch(/^Error/);
      const growth = JSON.parse(
        (await client.readResource({ uri: 'crux://growth' })).contents[0]!.text as string,
      ) as { snapshots: Array<{ label: string | null; requestedBy: string | null }> };
      expect(growth.snapshots.some((s) => s.label === 'From MCP')).toBe(true);
      expect(growth.snapshots.find((s) => s.label === 'From MCP')!.requestedBy).toBe(
        'agent:e2e-agent',
      );

      // ── delete_file blocks until the person approves in the app ───────────
      const deletion = client.callTool(
        { name: 'delete_file', arguments: { path: post } },
        undefined,
        { timeout: 120_000 },
      );
      const banner = page.getByText(/^Delete .*hello-from-mcp\.md\?$/);
      await expect(banner).toBeVisible({ timeout: 15_000 });
      // Still there while the banner waits — nothing happened without the click
      await page.waitForTimeout(500);
      expect(existsSync(join(folder(), post))).toBe(true);
      await page.screenshot({ path: 'e2e/.results/mcp-3-delete-banner.png' });
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      const deleted = await deletion;
      expect(textOf(deleted)).not.toMatch(/^Error|DECLINED/);
      await expect.poll(() => existsSync(join(folder(), post))).toBe(false);
      await expect(tree.getByText('hello-from-mcp.md', { exact: true })).toHaveCount(0);

      // ── strangers: no token → 401; foreign Host → refused ─────────────────
      const noToken = await rawPost(config.url, {}, INITIALIZE);
      expect(noToken.status).toBe(401);
      const wrongToken = await rawPost(
        config.url,
        { Authorization: 'Bearer not-the-token' },
        INITIALIZE,
      );
      expect(wrongToken.status).toBe(401);
      const foreignHost = await rawPost(
        config.url,
        { Authorization: `Bearer ${config.token}`, Host: 'crux.garden' },
        INITIALIZE,
      );
      expect(foreignHost.status).toBe(421);
      // …and the real client still works after all that
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);

      // ── stdio launcher: a plain-node proxy to the same server ─────────────
      const stdio = new Client({ name: 'e2e-stdio', version: '1.0.0' });
      await stdio.connect(
        new StdioClientTransport({
          command: process.execPath.includes('node') ? process.execPath : 'node',
          args: [
            join(__dirname, '..', 'dist', 'mcp-stdio.js'),
            '--config',
            join(folder(), '.crux', 'mcp.json'),
          ],
        }),
      );
      expect((await stdio.listTools()).tools.map((t) => t.name)).toContain('write_file');
      expect(
        JSON.parse((await stdio.readResource({ uri: 'crux://files' })).contents[0]!.text as string)
          .files.length,
      ).toBeGreaterThan(0);
      await stdio.close();
    } finally {
      await client?.close().catch(() => {});
      await app.close();
    }
  });

  test('Blank crux + mock API: publish waits for the in-app approval, then get_usage reads back', async () => {
    const api = await startMockApi();
    const { app, page, dir } = await launchApp({ env: { CRUX_API_URL: api.url } });
    const gardenRoot = join(dir, 'garden');
    let client: Client | null = null;
    try {
      await plantGarden(page, /^Blank/);
      await expect(page.getByRole('button', { name: 'New file' })).toBeVisible({
        timeout: 30_000,
      });

      // Connect the account first (Settings → Account), then switch the host on
      await page.keyboard.press('ControlOrMeta+,');
      await page.getByPlaceholder('email@example.com').fill('tester@example.com');
      await page.getByRole('button', { name: 'Send Code' }).click();
      await page.getByPlaceholder('Enter code').fill('123456');
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(page.getByText(/Connected/).first()).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);

      const config = await enableAgentHost(page, gardenRoot);
      client = await connect(config, 'e2e-publisher');

      const written = await client.callTool({
        name: 'write_file',
        arguments: { path: 'index.html', content: '<h1>Hello from an agent</h1>' },
      });
      expect(textOf(written)).not.toMatch(/^Error/);

      // publish blocks on the banner; declining is honoured…
      const declined = client.callTool({ name: 'publish', arguments: {} }, undefined, {
        timeout: 120_000,
      });
      const approvals = page.getByTestId('agent-approvals');
      await expect(approvals).toContainText('e2e-publisher wants to publish this crux', {
        timeout: 15_000,
      });
      await approvals.getByRole('button', { name: 'Not now' }).click();
      expect(textOf(await declined)).toMatch(/DECLINED/);
      expect(api.log.some((l) => l.includes('/publish'))).toBe(false);

      // …and approving publishes for real (against the mock API)
      const publishing = client.callTool({ name: 'publish', arguments: {} }, undefined, {
        timeout: 120_000,
      });
      await expect(approvals).toContainText('wants to publish', { timeout: 15_000 });
      await page.screenshot({ path: 'e2e/.results/mcp-4-publish-banner.png' });
      await approvals.getByRole('button', { name: 'Publish' }).click();
      const published = textOf(await publishing);
      expect(published).toMatch(/^Published\. Live at .*crux\.garden\/tester\//);
      expect(api.log.some((l) => l.startsWith('POST /cruxes ->'))).toBe(true);
      expect(
        api.log.some((l) =>
          l.startsWith(`POST /cruxes/${api.state.crux!.id as string}/publish -> 200`),
        ),
      ).toBe(true);
      expect(api.state.published[api.state.crux!.id as string]!.map((f) => f.path)).toContain(
        'index.html',
      );

      const usage = JSON.parse(textOf(await client.callTool({ name: 'get_usage', arguments: {} })));
      expect(usage.crux.cruxId).toBe(config.cruxId);
      expect(usage.account.plan).toBeTruthy();

      // The transcript shows the agent's publish under its name
      await expect(page.getByText('agent:e2e-publisher').first()).toBeVisible();
    } finally {
      await client?.close().catch(() => {});
      await app.close();
      await api.close();
    }
  });
});
