import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from '../launch';
import { enterGarden, createCrux, storedCrux } from '../multi-crux-helpers';
import { openPanel, showPane, hidePane } from '../panel-helpers';
import { writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 24 · Settings: Agents — an exported project carries no
 * connection credentials. Connecting, scoping and tokens are journeys/09,
 * garden-mcp and agent-host specs.
 */
const text = (result: unknown) =>
  (result as { content: Array<{ text?: string }> }).content.map((c) => c.text ?? '').join('\n');

test.describe('guide 24 · Agents', () => {
  test('MCP-08 — a Crux with agent access enabled exports without its token or mcp.json', async () => {
    test.setTimeout(150_000);
    const { app, page, dir } = await launchApp();
    try {
      await enterGarden(page);
      const id = await createCrux(page, 'Agent study');
      await writeFirstFile(page, 'index.html', '<h1>Study</h1>');
      const settings = await showPane(page, 'Settings');
      await settings
        .getByRole('switch', { name: 'Agent access for Agent study', exact: true })
        .click();
      const folder = (await storedCrux(page, id)).projectFolder as string;
      const configPath = join(folder, '.crux', 'mcp.json');
      await expect.poll(() => existsSync(configPath), { timeout: 30_000 }).toBe(true);
      const { token } = JSON.parse(readFileSync(configPath, 'utf8')) as { token: string };
      expect(token.length).toBeGreaterThan(8);
      await hidePane(page, 'Settings');

      const exportPane = await openPanel(page, 'export', 'Toggle export');
      const filename = join(dir, 'agent-study.crux');
      await app.evaluate(({ session }, filename) => {
        session.defaultSession.once('will-download', (_event: Event, item: DownloadItem) =>
          item.setSavePath(filename),
        );
      }, filename);
      await exportPane.getByRole('button', { name: 'Export Crux', exact: true }).click();
      await expect.poll(() => existsSync(filename), { timeout: 60_000 }).toBe(true);
      const zip = await JSZip.loadAsync(readFileSync(filename));
      const names = Object.keys(zip.files);
      expect(names.some((n) => /(^|\/)\.crux\/mcp\.json$/.test(n))).toBe(false);
      // No entry carries the token, in any file the archive holds.
      for (const name of names) {
        const entry = zip.file(name);
        if (!entry) continue;
        const text = await entry.async('string');
        expect(text.includes(token), name).toBe(false);
      }
    } finally {
      await app.close();
    }
  });

  test('MCP-02 — over a per-Crux connection an agent writes, reads, renames and checkpoints in that Crux; another Crux is out of reach', async () => {
    test.setTimeout(150_000);
    const { app, page } = await launchApp();
    let client: Client | undefined;
    try {
      await enterGarden(page);
      const otherId = await createCrux(page, 'Other study');
      await writeFirstFile(page, 'secret.txt', 'Not for the scoped agent');
      const otherFolder = (await storedCrux(page, otherId)).projectFolder as string;
      const scopedId = await createCrux(page, 'Scoped study');
      await writeFirstFile(page, 'index.html', '<h1>Scoped</h1>');
      const folder = (await storedCrux(page, scopedId)).projectFolder as string;
      const settings = await showPane(page, 'Settings');
      await settings
        .getByRole('switch', { name: 'Agent access for Scoped study', exact: true })
        .click();
      const config = await page.evaluate(async (id) => {
        for (let i = 0; i < 50; i++) {
          const found = (await window.electronAPI!.agentHost.list()).find((s) => s.cruxId === id);
          if (found) return found;
          await new Promise((r) => setTimeout(r, 200));
        }
        throw new Error('no server for the crux');
      }, scopedId);
      await hidePane(page, 'Settings');
      client = new Client({ name: 'guide-agent', version: '1' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
        }),
      );
      const call = async (name: string, args: Record<string, unknown>) => {
        const result = await client!.callTool({ name, arguments: args });
        return { error: result.isError === true, text: text(result) };
      };
      // Write, read, rename: each lands on disk and in the app.
      const written = await call('write_file', { path: 'draft.txt', content: 'From outside\n' });
      expect(written.error, written.text).toBe(false);
      await expect.poll(() => existsSync(join(folder, 'draft.txt'))).toBe(true);
      await expect(page.getByText('agent:guide-agent').first()).toBeVisible({ timeout: 15_000 });
      const read = await call('read_file', { path: 'draft.txt' });
      expect(read.error).toBe(false);
      expect(read.text).toContain('From outside');
      const renamed = await call('rename_file', { old_path: 'draft.txt', new_path: 'final.txt' });
      expect(renamed.error, renamed.text).toBe(false);
      await expect.poll(() => existsSync(join(folder, 'final.txt'))).toBe(true);
      expect(existsSync(join(folder, 'draft.txt'))).toBe(false);
      await expect(page.getByRole('tree').getByText('final.txt', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole('tree').getByText('draft.txt', { exact: true })).toHaveCount(0);
      // A checkpoint on request, in the Crux's Growth, attributed to the agent.
      const snap = await call('snapshot', { label: 'Outside checkpoint' });
      expect(snap.error, snap.text).toBe(false);
      const growth = JSON.parse(
        (await client.readResource({ uri: 'crux://growth' })).contents[0]!.text as string,
      ) as { snapshots: Array<{ label: string | null; requestedBy: string | null }> };
      expect(growth.snapshots.find((s) => s.label === 'Outside checkpoint')?.requestedBy).toBe(
        'agent:guide-agent',
      );
      const history = await openPanel(page, 'history', 'Toggle growth');
      await expect(history.getByText('Outside checkpoint', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      // The other Crux: not listed, not reachable by path.
      const listed = await call('list_files', {});
      expect(listed.text).not.toContain('secret.txt');
      const escape = await call('write_file', {
        path: `../${otherFolder.split('/').pop()}/planted.txt`,
        content: 'must not land',
      });
      expect(escape.error).toBe(true);
      expect(existsSync(join(otherFolder, 'planted.txt'))).toBe(false);
      const peek = await call('read_file', {
        path: '../' + otherFolder.split('/').pop() + '/secret.txt',
      });
      expect(peek.error || !peek.text.includes('Not for the scoped agent')).toBe(true);
    } finally {
      await client?.close().catch(() => {});
      await app.close();
    }
  });

  test('MCP-07 — Regenerate token: the old one is refused, the new snippet connects, switching off ends it', async () => {
    test.setTimeout(150_000);
    const { app, page, dir } = await launchApp();
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    const connect = async (config: { url: string; token: string }) => {
      const client = new Client({ name: 'guide-gardener', version: '1' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
        }),
      );
      return client;
    };
    const probe = (url: string, token: string) =>
      fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      }).then(
        (r) => r.status,
        () => 0, // nothing listening
      );
    let client: Client | undefined;
    try {
      await enterGarden(page);
      await createCrux(page, 'Listed');
      const settings = await showPane(page, 'Settings');
      await settings
        .getByRole('switch', { name: 'Agent access for Whole garden', exact: true })
        .click();
      await expect.poll(() => existsSync(configPath)).toBe(true);
      const first = JSON.parse(readFileSync(configPath, 'utf8')) as { url: string; token: string };
      client = await connect(first);
      expect(text(await client.callTool({ name: 'list_cruxes', arguments: {} }))).toContain(
        'Listed',
      );
      await client.close();
      client = undefined;
      // Regenerate: the file, the snippet and the server all move to the new token.
      const gardenPanel = settings.getByTestId('agents-garden-access');
      const connectButton = gardenPanel.getByRole('button', { name: 'Connect', exact: true });
      if (await connectButton.isVisible().catch(() => false)) await connectButton.click();
      await gardenPanel
        .getByRole('button', { name: 'Regenerate token' })
        .click({ timeout: 30_000 });
      await expect
        .poll(() => JSON.parse(readFileSync(configPath, 'utf8')).token !== first.token)
        .toBe(true);
      const second = JSON.parse(readFileSync(configPath, 'utf8')) as { url: string; token: string };
      await expect(gardenPanel).toContainText(second.token);
      await expect(gardenPanel).not.toContainText(first.token);
      expect(await probe(second.url, first.token)).toBe(401);
      client = await connect(second);
      expect(text(await client.callTool({ name: 'list_cruxes', arguments: {} }))).toContain(
        'Listed',
      );
      await client.close();
      client = undefined;
      // Off: the config goes and the new token no longer opens anything.
      await settings
        .getByRole('switch', { name: 'Agent access for Whole garden', exact: true })
        .click();
      await expect.poll(() => existsSync(configPath)).toBe(false);
      await expect.poll(() => probe(second.url, second.token)).not.toBe(200);
      await expect(connect(second)).rejects.toThrow();
    } finally {
      await client?.close().catch(() => {});
      await app.close();
    }
  });
});
