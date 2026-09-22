import { panelPressed, togglePanel } from './panel-helpers';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { enterGarden, createCrux, switchCrux } from './multi-crux-helpers';

test('WWW browses unframeable sites with isolated privileges, UI/MCP controls, modal occlusion and restart', async () => {
  test.setTimeout(150000);
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: 'file:///etc/passwd' });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
    });
    res.end(
      `<html><title>Reference ${req.url}</title><body style="background:#eef3eb;color:#163123;font:24px sans-serif;padding:40px"><h1>Reference ${req.url}</h1><p>A website beside your work.</p><a href="/two">Second page</a><p><a href="/three" target="_blank">A popup link</a></p><a href="file:///etc/passwd" id="file">Blocked local file</a></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const first = await launchApp();
  const { app, page, dir } = first;
  let client: Client | undefined;
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Web research');
    for (const label of ['tasks', 'collaboration', 'workshop']) {
      if ((await panelPressed(page, `Toggle ${label}`)) === 'true')
        await togglePanel(page, `Toggle ${label}`);
    }
    await togglePanel(page, 'Toggle www');
    const address = page.getByRole('textbox', { name: 'Browser address' });
    await address.fill(`${base}/one`);
    await address.press('Enter');
    const native = () =>
      app.evaluate(({ webContents }, base) => {
        const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith(base));
        return wc
          ? { id: wc.id, url: wc.getURL(), title: wc.getTitle(), prefs: wc.getLastWebPreferences() }
          : null;
      }, base);
    await expect.poll(async () => (await native())?.title).toBe('Reference /one');
    const guestId = (await native())!.id;
    expect((await native())!.prefs).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    const guest = (script: string) =>
      app.evaluate(
        ({ webContents }, args) =>
          webContents.fromId(args.id)!.executeJavaScript(args.script, true),
        { id: guestId, script },
      );
    expect(
      await guest(
        '({bridge:typeof window.electronAPI,node:typeof require,process:typeof process})',
      ),
    ).toEqual({ bridge: 'undefined', node: 'undefined', process: 'undefined' });
    const visible = () =>
      app.evaluate(({ BrowserWindow }, guestId) => {
        const child = BrowserWindow.getAllWindows()[0]!.contentView.children.find(
          (v) => 'webContents' in v && (v as Electron.WebContentsView).webContents.id === guestId,
        );
        return child?.getVisible() ?? false;
      }, guestId);
    await expect.poll(visible).toBe(true);
    const screenshot = await app.evaluate(
      async ({ BrowserWindow, desktopCapturer, systemPreferences }) => {
        if (
          process.platform === 'darwin' &&
          systemPreferences.getMediaAccessStatus('screen') !== 'granted'
        )
          return null;
        const win = BrowserWindow.getAllWindows()[0]!;
        const source = (
          await desktopCapturer.getSources({
            types: ['window'],
            thumbnailSize: { width: 1400, height: 900 },
          })
        ).find((s) => s.id === win.getMediaSourceId());
        return source && !source.thumbnail.isEmpty()
          ? source.thumbnail.toPNG().toString('base64')
          : null;
      },
    );
    if (screenshot)
      writeFileSync('e2e/.results/www-browser.png', Buffer.from(screenshot, 'base64'));
    const pageImage = await app.evaluate(
      async ({ webContents }, id) =>
        (await webContents.fromId(id)!.capturePage()).toPNG().toString('base64'),
      guestId,
    );
    writeFileSync('e2e/.results/www-page.png', Buffer.from(pageImage, 'base64'));
    await app.evaluate(({ webContents }, id) => {
      const wc = webContents.fromId(id)!;
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'L', modifiers: ['meta'] });
    }, guestId);
    await expect(address).toBeFocused();
    await page.getByRole('button', { name: 'Add panel', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Find a panel' })).toBeFocused();
    await expect.poll(visible).toBe(false);
    await page.keyboard.press('Escape');
    await expect.poll(visible).toBe(true);
    await page.getByRole('button', { name: 'Account menu', exact: true }).click();
    await expect.poll(visible).toBe(false);
    await page.getByRole('button', { name: 'Account menu', exact: true }).click();
    await expect.poll(visible).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1100, 800));
    await expect
      .poll(async () => {
        const rect = await page.getByTestId('browser-page').boundingBox();
        const bounds = await app.evaluate(({ BrowserWindow }, guestId) => {
          const child = BrowserWindow.getAllWindows()[0]!.contentView.children.find(
            (v) => 'webContents' in v && (v as Electron.WebContentsView).webContents.id === guestId,
          );
          return child?.getBounds();
        }, guestId);
        return (
          !!rect &&
          !!bounds &&
          Math.abs(rect.width - bounds.width) <= 1 &&
          Math.abs(rect.height - bounds.height) <= 1
        );
      })
      .toBe(true);

    await guest("document.querySelector('a').click()");
    await expect(address).toHaveValue(`${base}/two`);
    await page.getByRole('button', { name: 'Browser back', exact: true }).click();
    await expect(address).toHaveValue(`${base}/one`);
    await page.getByRole('button', { name: 'Browser forward', exact: true }).click();
    await expect(address).toHaveValue(`${base}/two`);
    await page.getByRole('button', { name: 'Reload browser', exact: true }).click();
    await expect.poll(async () => (await native())?.title).toBe('Reference /two');
    await guest("document.querySelector('[target]').click()");
    await expect(address).toHaveValue(`${base}/three`);
    await guest("document.getElementById('file').click()");
    // Chromium itself refuses file links before the navigation event is emitted.
    await expect(address).toHaveValue(`${base}/three`);
    expect((await native())?.url).toBe(`${base}/three`);
    await app.evaluate(({ webContents }, id) => {
      const wc = webContents.fromId(id)!;
      wc.focus();
      wc.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['meta'] });
    }, guestId);
    await expect(page.getByRole('region', { name: 'Workspace layouts' })).toBeVisible();
    await expect.poll(visible).toBe(false);
    await page.getByRole('switch', { name: 'Agent access for Whole garden', exact: true }).click();
    const path = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(path)).toBe(true);
    const config = JSON.parse(readFileSync(path, 'utf8'));
    client = new Client({ name: 'browser-gardener', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const result = await client.callTool({
      name: 'browser',
      arguments: { action: 'navigate', url: `${base}/agent` },
    });
    expect(result.isError).not.toBe(true);
    await page.keyboard.press('Escape');
    await expect(address).toHaveValue(`${base}/agent`);
    await expect.poll(visible).toBe(true);
    const blocked = await page.evaluate(async (id) => {
      try {
        await window.electronAPI!.browser!.action(id, 'navigate', 'crux-app://index.html');
        return false;
      } catch {
        return true;
      }
    }, id);
    expect(blocked).toBe(true);
    await page.getByRole('button', { name: 'Close WWW', exact: true }).click();
    await expect
      .poll(async () => app.evaluate(({ webContents }, id) => !!webContents.fromId(id), guestId))
      .toBe(false);
    await togglePanel(page, 'Toggle www');
    await expect(address).toHaveValue(`${base}/agent`);
    await createCrux(page, 'Other web research');
    await togglePanel(page, 'Toggle www');
    await address.fill(`${base}/other`);
    await address.press('Enter');
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(
              async (id) => window.electronAPI!.browser!.action(id, 'state'),
              (await page.locator('[data-workspace-id]').getAttribute('data-workspace-id'))!,
            )
          ).url,
      )
      .toBe(`${base}/other`);
    await switchCrux(page, 'Web research');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(800, 700));
    await page.getByRole('button', { name: 'Switch Crux workspace', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Switch Crux workspace' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(address).toHaveValue(`${base}/agent`);
  } catch (error) {
    server.closeAllConnections();
    server.close();
    throw error;
  } finally {
    await client?.close();
    await app.close();
  }
  const second = await launchApp({ dir });
  try {
    await second.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(second.page.getByRole('textbox', { name: 'Browser address' })).toHaveValue(
      `${base}/agent`,
    );
  } finally {
    await second.app.close();
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
