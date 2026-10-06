import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { launchApp } from './launch';

test('the real updater checks a local feed, reports malformed metadata and recovers without downloading', async () => {
  const requests: string[] = [];
  const feed = createServer((req, res) => {
    requests.push(req.url ?? '');
    res.setHeader('Content-Type', 'text/yaml');
    if (requests.length === 2) return res.end('files: [unterminated');
    res.end(
      [
        'version: 9.0.0',
        'files:',
        '  - url: fixture-update.zip',
        `    sha512: ${Buffer.alloc(64).toString('base64')}`,
        '    size: 1',
        'releaseDate: 2026-09-28T00:00:00.000Z',
      ].join('\n'),
    );
  });
  await new Promise<void>((resolve) => feed.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(feed.address() as AddressInfo).port}/`;
  let instance: Awaited<ReturnType<typeof launchApp>> | undefined;
  try {
    instance = await launchApp();
    const states = await instance.app.evaluate(async ({ app }, url) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { autoUpdater } = load('electron-updater') as typeof import('electron-updater');
      const { Updater } = load('./dist/updater') as typeof import('../src/updater');
      // Exercise only metadata checks from an isolated development app. Linux's
      // updater also needs the AppImage marker; no binary is fetched or installed.
      if (process.platform === 'linux') process.env.APPIMAGE = process.execPath;
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.setFeedURL({ provider: 'generic', url });
      const updater = new Updater({
        app,
        autoUpdater,
        autoCheck: () => false,
        setAutoCheck: () => {},
        log: { info: () => {}, error: () => {} },
        onChange: () => {},
      });
      autoUpdater.autoInstallOnAppQuit = false;
      return [await updater.check(), await updater.check(), await updater.check()];
    }, url);
    expect(states[0]).toMatchObject({ status: 'available', availableVersion: '9.0.0' });
    expect(states[1]).toMatchObject({ status: 'error', failedAction: 'check' });
    expect(states[2]).toMatchObject({
      status: 'available',
      availableVersion: '9.0.0',
      error: null,
    });
    expect(requests).toHaveLength(3);
    expect(requests.every((url) => /\.yml(?:\?|$)/.test(url))).toBe(true);
  } finally {
    await instance?.app.close();
    feed.closeAllConnections();
    await new Promise<void>((resolve) => feed.close(() => resolve()));
  }
});
