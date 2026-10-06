import { enableAdvancedMode } from '../panel-helpers';
import { test, expect, chromium } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import { launchApp } from '../launch';
import { enterGarden } from '../multi-crux-helpers';
import { LOCAL_API, LOCAL_API_LOG, useLocalApi, signInLocally } from '../local-api-helpers';
import catalog from '../../../src/data/cruxspace-templates.json';

const enabled = process.env.CRUX_PUBLISH_UNDERTAKINGS;
test.skip(!enabled || !LOCAL_API || !LOCAL_API_LOG, 'Opt-in local API publication acceptance');

test('worked examples publish real finish-line pages through the outside MCP client', async () => {
  test.setTimeout(30 * 60_000);
  expect(['localhost', '127.0.0.1']).toContain(new URL(LOCAL_API!).hostname);
  const { app, page, dir } = await launchApp();
  const client = new Client({ name: 'crux-garden-publication-check', version: '1' });
  let activeCrux = '';
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.avif': 'image/avif',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.csv': 'text/csv',
  };
  // The API's actual published objects, served like its static S3 origin.
  const objects = resolve(__dirname, '../../../../api/.local-storage/publish.crux.garden');
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://local').pathname)
      .split('/')
      .filter(Boolean);
    if (!activeCrux) {
      res.writeHead(404).end();
      return;
    }
    const base = join(objects, activeCrux);
    let file = resolve(base, ...path);
    if (!file.startsWith(base + '/')) file = join(base, 'index.html');
    if (!extname(file)) file = join(file, 'index.html');
    if (!existsSync(file) || !file.startsWith(base + '/')) {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
      .end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  try {
    await enterGarden(page);
    await enableAdvancedMode(page);
    await useLocalApi(page);
    await signInLocally(page);
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    const configPath = join(dir, 'userData/garden-agent-host/.crux/mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    await page.keyboard.press('Escape');
    async function call(name: string, input: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: input }, undefined, {
        timeout: 10 * 60_000,
      });
      const text = (result.content as { text?: string }[]).map((c) => c.text || '').join('\n');
      expect(result.isError, text).not.toBe(true);
      expect(text).not.toMatch(/^(Error:|Tool error:)/);
      return text;
    }
    for (const entry of catalog.filter(
      (c) => enabled === 'all' || enabled?.split(',').includes(c.id),
    )) {
      const space = /id: (\S+)/.exec(
        await call('create_cruxspace', {
          name: entry.name,
          templateId: entry.id,
          exampleMode: 'start',
        }),
      )![1];
      const id = await page.evaluate(async (space) => {
        const row = (await window.electronAPI!.sqlite.get(
          'SELECT value FROM settings WHERE key=?',
          ['cruxgarden:cruxspace:' + space],
        )) as { value: string };
        return JSON.parse(row.value).cruxIds[1] as string;
      }, space);
      await call('show', { what: 'crux', cruxId: id });
      await expect(page.locator(`[data-workspace-id="${id}"]`)).toBeVisible();
      await call('show', { what: 'pane', pane: 'collaboration' });
      // Outside agents use the same visible publication approval as the UI.
      // This job publishes only isolated examples to the local test API.
      const publishing = call('publish_crux', { cruxId: id });
      void publishing.catch(() => {}); // Teardown may cancel a still-pending approval.
      await page
        .getByTestId('agent-approvals')
        .getByRole('button', { name: 'Publish', exact: true })
        .click({ timeout: 30000 });
      await publishing;
      const local = (await page.evaluate(
        async (id) =>
          window.electronAPI!.sqlite.get('SELECT slug,meta FROM cruxes WHERE id=?', [id]),
        id,
      )) as { slug: string; meta: string };
      expect(JSON.parse(local.meta).publishedAt).toBeTruthy();
      activeCrux = id;
      const index = join(objects, id, 'index.html');
      expect(existsSync(index)).toBe(true);
      const publicPage = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        reducedMotion: 'reduce',
      });
      await publicPage.goto(`http://127.0.0.1:${port}/`);
      await publicPage.waitForLoadState('networkidle');
      const title = (
        {
          'home-page': 'Moss & Morning',
          'small-game': 'Firefly Catch',
          'short-book': 'Small Hours',
          'small-business': 'Bloom & Ink',
          'research-question': 'Does more light mean taller seedlings?',
          'family-history': 'The blue kitchen',
        } as Record<string, string>
      )[entry.id];
      await expect(publicPage.getByText(title, { exact: false }).first()).toBeVisible({
        timeout: 60000,
      });
      if (entry.id === 'home-page')
        await expect(publicPage.getByRole('heading', { name: title, exact: true })).toHaveCSS(
          'opacity',
          '1',
        );
      if (entry.id === 'small-business')
        await expect(
          publicPage.getByRole('heading', { name: 'A little character for your shop.' }),
        ).toBeVisible();
      if (entry.id === 'small-game') {
        for (let n = 0; n < 8; n++)
          await publicPage.getByRole('button', { name: 'Catch the firefly' }).click();
        await expect(publicPage.getByRole('status')).toContainText('You caught them all');
      }
      if (entry.id === 'research-question')
        await expect(publicPage.locator('circle')).toHaveCount(6);
      const evidence = resolve(__dirname, '../../../docs/templates', entry.id);
      mkdirSync(evidence, { recursive: true });
      await publicPage.screenshot({ path: join(evidence, 'published.png'), fullPage: true });
      if (entry.id === 'small-business') {
        await publicPage.goto(`http://127.0.0.1:${port}/faq/`);
        await expect(publicPage.locator('.scroll-animation')).toHaveCount(0);
        for (const question of [
          'What does a project usually cost?',
          'How long does it take?',
          'How do we start?',
          'What do you need from me?',
          'What happens when the work is done?',
        ])
          await expect(publicPage.getByText(question, { exact: true })).toBeVisible();
      }
      await publicPage.close();
      console.log(`published and opened ${entry.id}: ${id}`);
    }
  } finally {
    await app.close();
    await client.close().catch(() => {});
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
