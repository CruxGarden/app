import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';
import { createCrux, enterGarden, storedCrux } from './multi-crux-helpers';
import { togglePanel, enableAi, showPane } from './panel-helpers';

test('pathological garden search refuses without freezing the renderer and the next search works', async () => {
  const { app, page } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  try {
    await enterGarden(page);
    const id = await createCrux(page, 'Search bounds');
    const folder = (await storedCrux(page, id)).projectFolder as string;
    writeFileSync(join(folder, 'search.txt'), 'a'.repeat(100) + '!\nsearch-recovered');
    await togglePanel(page, 'Toggle artifacts');
    await expect(page.getByRole('tree').getByText('search.txt', { exact: true })).toBeVisible();
    await enableAi(page);
    const consolePane = await showPane(page, 'Console');
    const composer = consolePane.getByPlaceholder('Send a message...');
    const trail: string[] = [];
    page.on('console', (message) => {
      if (message.text().startsWith('[garden-tool] search_garden')) trail.push(message.text());
    });
    await page.evaluate(() => {
      (window as any).searchTicks = 0;
      (window as any).searchTimer = setInterval(() => (window as any).searchTicks++, 20);
    });
    await composer.fill('[garden:search-limits] Search and recover.');
    await composer.press('Enter');
    await expect.poll(() => trail.length, { timeout: 15000 }).toBe(2);
    expect(trail[0]).toContain('Search timed out');
    expect(trail[1]).toContain('search.txt:2: search-recovered');
    expect(
      await page.evaluate(() => {
        clearInterval((window as any).searchTimer);
        return (window as any).searchTicks;
      }),
    ).toBeGreaterThan(20);
    await expect(composer).toBeEnabled();
  } finally {
    await app.close();
  }
});

test('native recording refuses invalid dimensions and concurrent work, then captures again', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((_req, res) =>
    res.end('<body style="background:green">Recording</body>'),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    const cruxId = await createCrux(page, 'Recording bounds');
    const results = await page.evaluate(
      async ({ cruxId, url }) => {
        const opts = {
          cruxId,
          url,
          subdir: 'frames',
          width: 64,
          height: 64,
          fps: 1,
          maxSeconds: 1,
        };
        const failures: string[] = [];
        for (const [key, value] of [
          ['width', 999999],
          ['height', -1],
          ['maxSeconds', 181],
          ['fps', NaN],
        ] as const) {
          try {
            await window.electronAPI!.native.record({ ...opts, [key]: value });
          } catch (error) {
            failures.push(String(error));
          }
        }
        const simultaneous = await Promise.allSettled([
          window.electronAPI!.native.record(opts),
          window.electronAPI!.native.record(opts),
        ]);
        const retry = await window.electronAPI!.native.record({ ...opts, subdir: 'retry' });
        return {
          failures,
          simultaneous: simultaneous.map((r) =>
            r.status === 'fulfilled' ? r.value.frames : String(r.reason),
          ),
          retry,
        };
      },
      { cruxId, url },
    );
    expect(results.failures).toHaveLength(4);
    expect(results.failures.every((message) => message.includes('must be an integer'))).toBe(true);
    expect(results.simultaneous.filter((r) => r === 1)).toHaveLength(1);
    expect(results.simultaneous.join(' ')).toContain('already running');
    expect(results.retry.frames).toBe(1);
    const timeout = await app.evaluate(async ({ app, BrowserWindow }, url) => {
      const path = process.getBuiltinModule('path');
      const require = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { withCaptureWindow } = require(path.join(app.getAppPath(), 'dist/capture.js'));
      const before = BrowserWindow.getAllWindows().length;
      let message = '';
      try {
        await withCaptureWindow(
          url,
          { width: 64, height: 64 },
          () => new Promise(() => {}),
          15000,
          25,
        );
      } catch (error) {
        message = String(error);
      }
      return { message, before, after: BrowserWindow.getAllWindows().length };
    }, url);
    expect(timeout.message).toContain('capture operation timed out');
    expect(timeout.after).toBe(timeout.before);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
