import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

test('Navigator remembers personal choices, inherits Garden intent, retries failed writes and restores preferences', async () => {
  test.setTimeout(120_000);
  let instance = await launchApp();
  const dir = instance.dir;
  let client: Client | undefined;
  try {
    const { page } = instance;
    await enterGarden(page);
    const home = page.url();
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    const nav = page.getByRole('complementary', { name: 'Navigator' });
    await nav.getByText('Navigation preferences', { exact: true }).click({ timeout: 3000 });
    const own = nav.getByRole('combobox', { name: 'Garden navigation preference' });
    const view = nav.getByRole('combobox', { name: 'Navigation view', exact: true });
    await own.selectOption('neighborhood');
    await expect(view).toHaveValue('neighborhood');
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Studio');
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Studio',
    );
    const child = page.url();
    await expect(view).toHaveValue('neighborhood');
    await nav.getByText('Navigation preferences', { exact: true }).click();
    await expect(nav).toContainText('Using: My Garden');
    await expect(own).toHaveValue('');
    await instance.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load(
        path.join(app.getAppPath(), 'dist/sqlite-api.js'),
      ) as typeof import('../src/sqlite-api');
      const original = SqliteApi.prototype.get;
      SqliteApi.prototype.get = async function (sql: string, params?: unknown[]) {
        if (sql.includes("json_extract(meta, '$.navigation')")) {
          SqliteApi.prototype.get = original;
          throw new Error('Navigation read interrupted');
        }
        return original.call(this, sql, params);
      } as typeof original;
    });
    await nav.getByRole('button', { name: 'Refresh navigation', exact: true }).click();
    await expect(nav.getByRole('alert')).toContainText('Navigation read interrupted');
    await nav.getByRole('button', { name: 'Retry navigation preferences' }).click();
    await expect(view).toHaveValue('neighborhood');
    await expect(view).toBeEnabled();

    await view.selectOption('tree');
    await expect(view).toBeEnabled();
    await expect(nav).toContainText('Your choice in this Garden');
    await page.goto(home);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'My Garden',
    );
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await expect(view).toHaveValue('neighborhood');
    await page.goto(child);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Studio',
    );
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    await expect(view).toHaveValue('tree');
    await nav.getByText('Navigation preferences', { exact: true }).click();
    await nav.getByRole('button', { name: 'Follow Garden preference' }).click();
    await expect(view).toHaveValue('neighborhood');
    await nav.getByRole('combobox', { name: 'My default navigation view' }).selectOption('tree');
    await nav.getByRole('checkbox', { name: 'Always use my view' }).check();
    await expect(view).toHaveValue('tree');
    await instance.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load(
        path.join(app.getAppPath(), 'dist/sqlite-api.js'),
      ) as typeof import('../src/sqlite-api');
      const original = SqliteApi.prototype.run;
      SqliteApi.prototype.run = async function (sql: string, params?: unknown[]) {
        if (
          sql.includes('INSERT OR REPLACE INTO settings') &&
          String(params?.[0]).startsWith('cruxgarden:navigation:')
        ) {
          SqliteApi.prototype.run = original;
          throw new Error('Preference save interrupted');
        }
        return original.call(this, sql, params);
      } as typeof original;
    });
    await view.selectOption('neighborhood');
    await expect(nav.getByRole('alert')).toContainText('Preference save interrupted');
    await expect(view).toHaveValue('tree');
    await view.selectOption('neighborhood');
    await expect(view).toHaveValue('neighborhood');
    await expect(view).toBeEnabled();
    await page.setViewportSize({ width: 480, height: 720 });
    await expect.poll(() => nav.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('canvas.plasma-ground');
          return (
            !canvas || Math.abs(canvas.width / canvas.height - innerWidth / innerHeight) < 0.01
          );
        }),
      )
      .toBe(true);
    await page.screenshot({ path: 'e2e/.results/navigation-preferences.png' });
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await instance.page.goto(child);
    await expect(
      instance.page.getByRole('button', { name: 'Garden location', exact: true }),
    ).toHaveText('Studio');
    await instance.page.getByRole('button', { name: 'Navigator', exact: true }).click();
    const restored = instance.page.getByRole('complementary', { name: 'Navigator' });
    await expect(
      restored.getByRole('combobox', { name: 'Navigation view', exact: true }),
    ).toHaveValue('neighborhood');
    await restored.getByText('Navigation preferences', { exact: true }).click();
    await expect(restored.getByRole('checkbox', { name: 'Always use my view' })).toBeChecked();
    await restored.getByRole('checkbox', { name: 'Always use my view' }).uncheck();
    await expect(restored).toContainText('Using: My Garden');
    const restoredPage = instance.page;
    const childId = new URL(child).searchParams.get('garden')!;
    await restoredPage.keyboard.press('ControlOrMeta+,');
    await restoredPage
      .getByRole('region', { name: 'Settings', exact: true })
      .getByRole('switch', { name: 'Agent access for Whole garden', exact: true })
      .click();
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    client = new Client({ name: 'navigation-preferences-proof', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    await restoredPage.getByRole('button', { name: 'Close Settings', exact: true }).click();
    const call = async (action: string, view?: string) => {
      const result = await client!.callTool({
        name: 'garden_navigation',
        arguments: { gardenId: childId, action, ...(view ? { view } : {}) },
      });
      expect(result.isError).not.toBe(true);
      return JSON.parse((result.content as { text: string }[]).map((item) => item.text).join('\n'));
    };
    expect((await call('inspect')).source).toBe('My Garden');
    expect((await call('garden', 'tree')).source).toBe('Studio');
    await expect(
      restored.getByRole('combobox', { name: 'Navigation view', exact: true }),
    ).toHaveValue('tree');
    await call('garden', 'inherit');
    await expect(
      restored.getByRole('combobox', { name: 'Navigation view', exact: true }),
    ).toHaveValue('neighborhood');
    // A pending personal choice remains owned by Studio if the user leaves it.
    await instance.app.evaluate(({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load(
        path.join(app.getAppPath(), 'dist/sqlite-api.js'),
      ) as typeof import('../src/sqlite-api');
      const original = SqliteApi.prototype.run;
      SqliteApi.prototype.run = async function (sql: string, params?: unknown[]) {
        if (
          sql.includes('INSERT OR REPLACE INTO settings') &&
          String(params?.[0]).startsWith('cruxgarden:navigation:')
        ) {
          SqliteApi.prototype.run = original;
          await new Promise<void>((resolve) => {
            (
              globalThis as typeof globalThis & { releasePreference?: () => void }
            ).releasePreference = resolve;
          });
        }
        return original.call(this, sql, params);
      } as typeof original;
    });
    await restored
      .getByRole('combobox', { name: 'Navigation view', exact: true })
      .selectOption('tree');
    await expect
      .poll(() =>
        instance.app.evaluate(
          () =>
            !!(globalThis as typeof globalThis & { releasePreference?: () => void })
              .releasePreference,
        ),
      )
      .toBe(true);
    await restoredPage.getByRole('button', { name: 'Garden location', exact: true }).click();
    await restoredPage
      .getByRole('dialog', { name: 'Garden location', exact: true })
      .getByRole('button', { name: 'My Garden', exact: true })
      .click();
    await expect(
      restoredPage.getByRole('button', { name: 'Garden location', exact: true }),
    ).toHaveText('My Garden');
    await instance.app.evaluate(() =>
      (globalThis as typeof globalThis & { releasePreference?: () => void }).releasePreference?.(),
    );
    await expect.poll(async () => (await call('inspect')).lastView).toBe('tree');
    await expect(
      restoredPage.getByRole('button', { name: 'Garden location', exact: true }),
    ).toHaveText('My Garden');
    await expect(
      restored.getByRole('combobox', { name: 'Navigation view', exact: true }),
    ).toHaveValue('neighborhood');
  } finally {
    await client?.close().catch(() => {});
    await instance.app.close().catch(() => {});
  }
});
