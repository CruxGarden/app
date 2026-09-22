import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';
import { startMockApi } from './api-mock';

test('Settings and Explore panels share services and agent controls, fit their panes and restore without losing a draft', async () => {
  test.setTimeout(120000);
  const api = await startMockApi();
  for (const [index, title] of ['Rainy Garden Notes', 'Sunny Recipes'].entries()) {
    const id = `${index + 1}1111111-1111-4111-8111-111111111111`;
    api.state.cruxes[id] = {
      id,
      title,
      slug: title.toLowerCase().replaceAll(' ', '-'),
      kind: 'page',
      visibility: 'public',
      discoverable: true,
      meta: {},
      authorId: 'author-1',
      created: '2026-09-01T00:00:00.000Z',
      updated: '2026-09-02T00:00:00.000Z',
    };
  }
  const first = await launchApp({ env: { CRUX_API_URL: api.url } });
  const { page, app, dir } = first;
  let client: Client | undefined;
  try {
    await enterGarden(page);
    await createCrux(page, 'Research desk');
    const route = page.url();
    const composer = page.locator('[data-testid="pane-body-collaboration"] textarea').first();
    await composer.fill('Keep my unfinished thought');
    for (const name of ['tasks', 'collaboration', 'workshop']) {
      const toggle = page.getByRole('button', { name: `Toggle ${name}`, exact: true });
      if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
    }
    await page.getByRole('button', { name: 'Toggle settings', exact: true }).click();
    const settings = page.getByTestId('pane-body-settings');
    const title = settings.getByRole('textbox', { name: 'Garden title', exact: true });
    await title.fill('Night research');
    await title.press('Enter');
    await expect(page.getByRole('button', { name: 'Night research', exact: true })).toBeVisible();
    await settings
      .getByRole('switch', { name: 'Agent access for Whole garden', exact: true })
      .click();
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    client = new Client({ name: 'panel-gardener', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args });
      expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
      return result;
    };
    const tools = await client.listTools();
    expect(
      (
        tools.tools.find((t) => t.name === 'show')!.inputSchema.properties!.pane as {
          enum: string[];
        }
      ).enum,
    ).toEqual(expect.arrayContaining(['settings', 'explore', 'mood', 'synth', 'browser']));
    await call('show', { what: 'pane', pane: 'explore' });
    await call('workspace_layouts', {
      action: 'save',
      name: 'Research controls',
      layout: { direction: 'row', first: 'settings', second: 'explore', splitPercentage: 50 },
    });
    await call('workspace_layouts', { action: 'apply', name: 'Research controls' });
    const explore = page.getByTestId('pane-body-explore');
    await expect(explore.getByText('Rainy Garden Notes', { exact: true })).toBeVisible();
    await expect(explore.getByText('Sunny Recipes', { exact: true })).toBeVisible();
    await explore.getByPlaceholder(/moods and authors/).fill('rainy');
    await expect(explore.getByText('Sunny Recipes', { exact: true })).toHaveCount(0);
    expect(page.url()).toBe(route);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1100, 800));
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeVisible();
    await expect
      .poll(() => settings.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
      .toBe(true);
    await expect
      .poll(() => explore.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
      .toBe(true);
    await expect(
      settings.getByRole('textbox', { name: 'Name for Settings', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        settings
          .getByTestId('names-settings')
          .locator('.grid')
          .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
      )
      .toBe(1);
    // Plasma reallocates its canvas after resize settles; capture the completed frame.
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
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({ path: 'e2e/.results/settings-explore-panels.png' });
    await page.keyboard.press('ControlOrMeta+,');
    await expect(
      page
        .locator('[aria-modal="true"]')
        .getByRole('textbox', { name: 'Garden title', exact: true }),
    ).toHaveValue('Night research');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close Explore', exact: true }).click();
    await expect(explore).toHaveCount(0);
    await call('show', { what: 'pane', pane: 'explore' });
    await call('workspace_layouts', { action: 'apply', name: 'Research controls' });
    await expect(explore.getByPlaceholder(/moods and authors/)).toBeVisible();
    await call('workspace_layouts', { action: 'save', name: 'Writing', layout: 'collaboration' });
    await call('workspace_layouts', { action: 'apply', name: 'Writing' });
    await expect(composer).toHaveValue('Keep my unfinished thought');
    await call('workspace_layouts', { action: 'apply', name: 'Research controls' });
  } catch (error) {
    await api.close();
    throw error;
  } finally {
    await client?.close();
    await app.close();
  }
  const second = await launchApp({ dir, env: { CRUX_API_URL: api.url } });
  try {
    await second.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(
      second.page
        .getByTestId('pane-body-settings')
        .getByRole('textbox', { name: 'Garden title', exact: true }),
    ).toHaveValue('Night research');
    await expect(
      second.page.getByTestId('pane-body-explore').getByText('Rainy Garden Notes', { exact: true }),
    ).toBeVisible();
  } finally {
    await second.app.close();
    await api.close();
  }
});
