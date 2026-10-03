import { test, expect, chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchApp } from './launch';
import { startMockApi } from './api-mock';
import {
  enterGarden,
  createCrux,
  storedCrux,
  reenterWorkspace,
  goHome,
} from './multi-crux-helpers';
import { openPanel } from './panel-helpers';
import { fileText } from './content-helpers';
import { connectAccount, writeFirstFile } from './journeys/journey-helpers';

test('a website can be tested locally without an account, restarted and published without mixing staging and live copies', async () => {
  test.setTimeout(180_000);
  const api = await startMockApi();
  let running = await launchApp({ ai: false, env: { CRUX_API_URL: api.url } });
  try {
    let { page } = running;
    await running.app.evaluate(({ shell }) => {
      (globalThis as unknown as { opened: string[] }).opened = [];
      shell.openExternal = async (url: string) => {
        (globalThis as unknown as { opened: string[] }).opened.push(url);
      };
    });
    await enterGarden(page);
    const id = await createCrux(page, 'My first website');
    await writeFirstFile(page, 'index.html', '<h1>First visitor page</h1>');
    const folder = (await storedCrux(page, id)).projectFolder;
    let share = await openPanel(page, 'publish', 'Toggle share');
    await expect(share.getByRole('heading', { name: 'Publish to crux.garden' })).toBeVisible();
    await share.getByText('Test locally first', { exact: false }).click();
    await share.getByRole('button', { name: 'Publish to local test Garden', exact: true }).click();
    await expect(share.getByRole('button', { name: 'Open test website' })).toBeVisible();
    let sites = await page.evaluate(() => window.electronAPI!.staging!.list());
    expect(sites).toHaveLength(1);
    await expect(share.getByText('Matches your saved files.', { exact: false })).toBeVisible();
    await share.getByRole('button', { name: 'Open local test Garden' }).click();
    const galleryUrl = await running.app.evaluate(
      () => (globalThis as unknown as { opened: string[] }).opened.at(-1)!,
    );
    const browser = await chromium.launch();
    try {
      const visitor = await browser.newPage({ viewport: { width: 1200, height: 850 } });
      await visitor.goto(galleryUrl);
      await expect(visitor.getByRole('heading', { name: 'Local test Garden' })).toBeVisible();
      const evidence = resolve(__dirname, '../../docs/first-website/2026-10-03');
      mkdirSync(evidence, { recursive: true });
      await visitor.screenshot({ path: join(evidence, 'local-test-garden.png') });
      await visitor.goto(sites[0].url);
      await expect(visitor.getByRole('heading', { name: 'First visitor page' })).toBeVisible();
      // Real browser policy must stop an accidental request to the hosted API.
      let escapedRequests = 0;
      await visitor.route('https://staging-regression.invalid/**', (route) => {
        escapedRequests++;
        return route.abort();
      });
      const blocked = await visitor.evaluate(async () => {
        try {
          await fetch('https://staging-regression.invalid/should-not-run', {
            method: 'POST',
            body: 'test',
          });
          return false;
        } catch {
          return true;
        }
      });
      expect(blocked).toBe(true);
      expect(escapedRequests).toBe(0);
      await page.screenshot({ path: join(evidence, 'staging-and-live.png') });
    } finally {
      await browser.close();
    }

    expect(await (await fetch(sites[0].url)).text()).toContain('First visitor page');
    expect(api.state.published[id]).toBeUndefined();
    expect((await storedCrux(page, id)).meta?.publishedAt).toBeUndefined();
    // Editing real files must leave the saved visitor copy alone.
    writeFileSync(join(folder, 'index.html'), '<h1>Second visitor page</h1>');
    await expect.poll(() => fileText(page, id, 'index.html')).toContain('Second visitor page');
    expect(await (await fetch(sites[0].url)).text()).toContain('First visitor page');
    await expect(share.getByText('You have changes to test.', { exact: false })).toBeVisible();
    await running.app.close();
    running = await launchApp({ dir: running.dir, ai: false, env: { CRUX_API_URL: api.url } });
    page = running.page;
    await reenterWorkspace(page, 'My first website');
    share = await openPanel(page, 'publish', 'Toggle share');
    await share.getByText('Test locally first', { exact: false }).click();
    await expect(share.getByRole('button', { name: 'Update local test copy' })).toBeVisible();
    sites = await page.evaluate(() => window.electronAPI!.staging!.list());
    expect(await (await fetch(sites[0].url)).text()).toContain('First visitor page');
    await share.getByRole('button', { name: 'Share', exact: true }).click();
    await connectAccount(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Share without a backup' }).click();
    await expect(share.getByText('Up to date')).toBeVisible();
    expect(
      api.state.published[id].find((file) => file.path === 'index.html')!.bytes.toString(),
    ).toContain('Second visitor page');
    expect(await (await fetch(sites[0].url)).text()).toContain('First visitor page');
    writeFileSync(join(folder, 'index.html'), '<h1>Third visitor page</h1>');
    await expect.poll(() => fileText(page, id, 'index.html')).toContain('Third visitor page');
    await share.getByRole('button', { name: 'Update local test copy' }).click();
    await expect(share.getByRole('button', { name: 'Update local test copy' })).toBeEnabled();
    sites = await page.evaluate(() => window.electronAPI!.staging!.list());
    expect(await (await fetch(sites[0].url)).text()).toContain('Third visitor page');
    expect(
      api.state.published[id].find((file) => file.path === 'index.html')!.bytes.toString(),
    ).toContain('Second visitor page');
    await share.getByRole('button', { name: 'Remove test copy' }).click();
    await page
      .getByRole('dialog', { name: 'Remove local test copy?' })
      .getByRole('button', { name: 'Remove test copy', exact: true })
      .click();
    await expect(share.getByRole('button', { name: 'Publish to local test Garden' })).toBeEnabled();
    expect(await page.evaluate(() => window.electronAPI!.staging!.list())).toEqual([]);
    // Copies can also be managed from Home, independently of a project's Share pane.
    await share.getByRole('button', { name: 'Publish to local test Garden', exact: true }).click();
    await expect(share.getByRole('button', { name: 'Open test website' })).toBeVisible();
    await goHome(page);
    await page.getByRole('button', { name: 'Local test Garden', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Local test Garden', exact: true });
    await expect(manager.getByText('My first website', { exact: true })).toBeVisible();
    await manager.getByRole('button', { name: 'Remove test copy', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Remove local test copy?' })
      .getByRole('button', { name: 'Remove test copy', exact: true })
      .click();
    await expect(manager.getByText('No test copies yet.', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => window.electronAPI!.staging!.list())).toEqual([]);
    expect(await fileText(page, id, 'index.html')).toContain('Third visitor page');
    expect(
      api.state.published[id].find((file) => file.path === 'index.html')!.bytes.toString(),
    ).toContain('Second visitor page');
  } finally {
    await running.app.close();
    await api.close();
  }
});

test('a fresh home page reaches a saved local visitor edition without hosted services', async () => {
  test.setTimeout(8 * 60_000);
  let running = await launchApp({ ai: false });
  try {
    let { page } = running;
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await page.getByText('Plant a new garden').click();
    await page.getByRole('button', { name: 'Make my home page', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Edit my home page', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Edit my home page', exact: true }).click();
    await page.getByLabel('Your Name', { exact: true }).fill('My local home');
    await page.getByRole('button', { name: '3. Share it', exact: true }).click();
    await page.getByRole('button', { name: 'Open Share', exact: true }).click();
    const share = page.getByTestId('pane-body-publish');
    await share.getByText('Test locally first', { exact: false }).click();
    await share.getByRole('button', { name: 'Publish to local test Garden', exact: true }).click();
    await expect(share.getByRole('button', { name: 'Open test website' })).toBeVisible({
      timeout: 6 * 60_000,
    });
    const sites = await page.evaluate(() => window.electronAPI!.staging!.list());
    expect(sites).toHaveLength(1);
    expect(await (await fetch(sites[0].url)).text()).toContain('My local home');
    expect((await storedCrux(page, sites[0].id)).meta?.publishedAt).toBeUndefined();
    await running.app.close();
    running = await launchApp({ dir: running.dir, ai: false });
    page = running.page;
    await reenterWorkspace(page, 'Hello, world');
    const restored = await page.evaluate(() => window.electronAPI!.staging!.list());
    expect(restored[0].revision).toBe(sites[0].revision);
    expect(await (await fetch(restored[0].url)).text()).toContain('My local home');
    await goHome(page);
    await page.getByRole('button', { name: 'Local test Garden', exact: true }).click();
    const manager = page.getByRole('dialog', { name: 'Local test Garden', exact: true });
    await expect(manager.getByText('Hello, world', { exact: true })).toBeVisible();
    const evidence = resolve(__dirname, '../../docs/first-website/2026-10-03');
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, 'manage-local-test-garden.png') });
    // The real installation command must also remove this profile’s test editions.
    await page.evaluate(() => window.electronAPI!.sqlite.installation.wipeGarden());
    expect(await page.evaluate(() => window.electronAPI!.staging!.list())).toEqual([]);
    await expect(fetch(restored[0].url)).rejects.toThrow();
  } finally {
    await running.app.close();
  }
});
