import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enableAdvancedMode, showPane } from './panel-helpers';
import { enterGarden } from './multi-crux-helpers';

test('imported Garden graphs open Home and preserve nested members and private conversations through restart', async () => {
  test.setTimeout(150_000);
  let instance = await launchApp({ ai: false });
  const dir = instance.dir;
  let client: Client | undefined;
  try {
    const archive = await instance.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const fs = process.getBuiltinModule('fs');
      const { randomUUID } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime, CruxKind, DimensionType, packPrivateGraph } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const runtime = await LocalGraphRuntime.create(
        path.join(app.getPath('userData'), 'garden-import-source.db'),
      );
      const content = new Map<string, Uint8Array>();
      const store = {
        read: async (fp: string) => content.get(fp) ?? null,
        write: async (fp: string, bytes: Uint8Array) => {
          content.set(fp, bytes);
        },
      };
      const identity = { authorId: randomUUID(), homeId: randomUUID() };
      try {
        const garden = await runtime.createCrux({
          ...identity,
          title: 'Fieldwork',
          slug: 'fieldwork',
          kind: CruxKind.GARDEN,
          meta: {
            theme: { mode: 'light', tint: 'red' },
            gardenCollaboration: {
              version: 1,
              model: 'claude-sonnet-5',
              activeId: 'field-conversation',
              conversations: [
                {
                  id: 'field-conversation',
                  title: 'Field idea',
                  createdAt: 1,
                  messages: [{ role: 'user', content: 'Private field observations' }],
                },
              ],
            },
          },
        });
        const child = await runtime.createCrux({
          ...identity,
          title: 'Observations',
          slug: 'observations',
          kind: CruxKind.GARDEN,
        });
        const work = await runtime.createCrux({
          ...identity,
          title: 'Field notes',
          slug: 'field-notes',
        });
        await runtime.editFileContent({ cruxId: work, expected: null, changes: [] }, store);
        for (const [gardenId, memberId] of [
          [garden, child],
          [child, work],
        ])
          await runtime.execute(({ garden: service }) =>
            service.add({ ...identity, gardenId, memberId }),
          );
        await runtime.execute(({ dimension }) =>
          dimension.create({
            ...identity,
            sourceId: garden,
            targetId: work,
            type: DimensionType.GRAFT,
          }),
        );
        const graph = await runtime.exportPrivateGraph(
          { roots: [garden], includeMembers: true },
          store,
        );
        const filename = path.join(app.getPath('userData'), 'fieldwork.crux');
        fs.writeFileSync(filename, await packPrivateGraph(graph, store));
        return { filename, garden };
      } finally {
        await runtime.close();
      }
    });
    let { page } = instance;
    await enterGarden(page);
    await enableAdvancedMode(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('garden')).not.toBeNull();
    const home = new URL(page.url()).searchParams.get('garden')!;
    const appearance = await page.evaluate(() =>
      window.electronAPI!.sqlite.all(
        "SELECT key, value FROM settings WHERE key IN ('cruxgarden:theme', 'cruxgarden:tint') ORDER BY key",
      ),
    );
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(`CREATE TRIGGER refuse_garden_import
      BEFORE INSERT ON dimensions WHEN NEW.kind = 'membership'
      BEGIN SELECT RAISE(ABORT, 'Garden import temporarily unavailable'); END`),
    );
    await page.getByRole('button', { name: 'Add Crux', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import Crux, tool or Mood', exact: true }).click();
    await (await chooser).setFiles(archive.filename);
    await expect(
      page.getByText(/Failed to import.*Garden import temporarily unavailable/),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE title = 'Fieldwork'"),
      ),
    ).toEqual([]);
    await page.evaluate(() => window.electronAPI!.sqlite.run('DROP TRIGGER refuse_garden_import'));
    await page.keyboard.press('Escape');
    const retryChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import Crux, tool or Mood', exact: true }).click();
    await (await retryChooser).setFiles(archive.filename);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Fieldwork',
    );
    const imported = new URL(page.url()).searchParams.get('garden')!;
    expect(imported).not.toBe(archive.garden);
    expect(new URL(page.url()).pathname).toBe('/home');
    await expect(page.locator('[data-workspace-id]')).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all(
          "SELECT key, value FROM settings WHERE key IN ('cruxgarden:theme', 'cruxgarden:tint') ORDER BY key",
        ),
      ),
    ).toEqual(appearance);
    await expect(page.getByRole('button', { name: 'Open Field notes', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Open Observations', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Field notes', exact: true })).toBeVisible();
    const child = new URL(page.url()).searchParams.get('garden')!;
    const members = await page.evaluate(
      async ({ imported, child }) => {
        const api = window.electronAPI!.sqlite.gardenMembership;
        return [await api.list(imported), await api.list(child)];
      },
      { imported, child },
    );
    expect(members[0].items.map((row) => row.id)).toEqual([child]);
    expect(members[1].items).toHaveLength(1);
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await page
      .getByRole('complementary', { name: 'Navigator' })
      .getByRole('button', { name: 'My Garden', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Open Fieldwork', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Field notes', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    // The drop path must also enter the new Garden, rather than create an editor workspace for it.
    const transfer = await page.evaluateHandle(
      (bytes) => {
        const dt = new DataTransfer();
        dt.items.add(
          new File([Uint8Array.from(bytes)], 'fieldwork.crux', { type: 'application/zip' }),
        );
        return dt;
      },
      [...readFileSync(archive.filename)],
    );
    await page.getByTestId('home-drop').dispatchEvent('drop', { dataTransfer: transfer });
    await transfer.dispose();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Fieldwork',
    );
    expect(new URL(page.url()).searchParams.get('garden')).not.toBe(imported);
    await page.keyboard.press('ControlOrMeta+,');
    await page.locator('h2', { hasText: /^AI$/ }).click();
    await page.getByRole('switch', { name: 'Enable AI Tools' }).click();
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    await showPane(page, 'Console');
    await expect(
      page.getByRole('region', { name: 'Fieldwork · Collaboration', exact: true }),
    ).toContainText('Private field observations');
    await instance.app.close();
    instance = await launchApp({ dir, ai: false });
    page = instance.page;
    await page.getByRole('button', { name: /enter/i }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('garden')).toBe(home);
    await expect(page.getByRole('button', { name: 'Open Fieldwork', exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Open Fieldwork', exact: true }).first().click();
    await expect(
      page.getByRole('button', { name: 'Open Observations', exact: true }),
    ).toBeVisible();
    await showPane(page, 'Console');
    await expect(
      page.getByRole('region', { name: 'Fieldwork · Collaboration', exact: true }),
    ).toContainText('Private field observations');
    // A direct Crux URL for a Garden has the same meaning as the ordinary picker.
    await page.goto(`crux-app://app/c/${imported}?garden=${home}`);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Fieldwork',
    );
    expect(new URL(page.url()).pathname).toBe('/home');
    await expect(page.locator('[data-workspace-id]')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+,');
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    client = new Client({ name: 'garden-import-check', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    const shown = await client.callTool({
      name: 'show',
      arguments: { what: 'crux', cruxId: child },
    });
    expect(shown.isError).not.toBe(true);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Observations',
    );
    await expect(page.locator('[data-workspace-id]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Field notes', exact: true })).toBeVisible();
    await page.screenshot({ path: 'e2e/.results/garden-import.png' });
  } finally {
    await client?.close();
    await instance.app.close();
  }
});
