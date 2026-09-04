import { test, expect } from '@playwright/test';
import { EventEmitter } from 'node:events';

/**
 * Updater state machine (compiled to dist/updater.js by `npm run build`) driven
 * with a fake electron-updater — no Electron, no network.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Updater } = require('../dist/updater.js') as typeof import('../src/updater');
type UpdateState = import('../src/updater').UpdateState;
type AutoUpdaterLike = import('../src/updater').AutoUpdaterLike;

class FakeAutoUpdater extends EventEmitter implements AutoUpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  logger: unknown = null;
  installed = 0;
  checkImpl: () => Promise<unknown> = async () => {
    this.emit('checking-for-update');
    this.emit('update-available', { version: '1.1.0' });
  };
  downloadImpl: () => Promise<unknown> = async () => {
    this.emit('download-progress', { percent: 40.4 });
    this.emit('update-downloaded', { version: '1.1.0' });
  };
  installImpl: () => void = () => {
    this.installed++;
  };
  checkForUpdates() {
    return this.checkImpl();
  }
  downloadUpdate() {
    return this.downloadImpl();
  }
  quitAndInstall() {
    this.installImpl();
  }
}

function make(opts: { packaged?: boolean; fake?: FakeAutoUpdater | null } = {}) {
  const fake = opts.fake === undefined ? new FakeAutoUpdater() : opts.fake;
  const changes: UpdateState[] = [];
  const logs: string[] = [];
  let auto = true;
  const updater = new Updater({
    app: { isPackaged: opts.packaged ?? false, getVersion: () => '1.0.0' },
    autoCheck: () => auto,
    setAutoCheck: (on) => {
      auto = on;
    },
    log: { info: (m) => logs.push(m), error: (m) => logs.push(m) },
    onChange: (s) => changes.push(s),
    ...(fake ? { autoUpdater: fake } : {}),
  });
  return { updater, fake, changes, logs, auto: () => auto };
}

test.describe('Updater state machine', () => {
  test('is disabled when not packaged and nothing is injected', async () => {
    const { updater, changes } = make({ fake: null });
    expect(updater.getState()).toMatchObject({ status: 'disabled', currentVersion: '1.0.0' });
    expect(await updater.check()).toMatchObject({ status: 'disabled' });
    expect(changes).toHaveLength(0);
  });

  test('configures the injected updater: no auto download, install on quit', () => {
    const { updater, fake } = make();
    expect(updater.getState().status).toBe('idle');
    expect(fake!.autoDownload).toBe(false);
    expect(fake!.autoInstallOnAppQuit).toBe(true);
    expect(fake!.logger).not.toBeNull();
  });

  test('check → available → download → downloaded → install', async () => {
    const { updater, fake, changes } = make();
    const afterCheck = await updater.check();
    expect(afterCheck).toMatchObject({
      status: 'available',
      availableVersion: '1.1.0',
      error: null,
      failedAction: null,
    });
    expect(afterCheck.lastCheckedAt).not.toBeNull();
    expect(changes.map((c) => c.status)).toEqual(['checking', 'available']);

    const afterDownload = await updater.download();
    expect(afterDownload).toMatchObject({ status: 'downloaded', progress: 100 });
    expect(changes.map((c) => c.status)).toEqual([
      'checking',
      'available',
      'downloading',
      'downloaded',
    ]);
    expect(changes[2]!.progress).toBe(40);

    updater.install();
    expect(fake!.installed).toBe(1);
  });

  test('a check that finds nothing reports not-available', async () => {
    const { updater, fake } = make();
    fake!.checkImpl = async () => {
      fake!.emit('checking-for-update');
      fake!.emit('update-not-available');
    };
    expect(await updater.check()).toMatchObject({
      status: 'not-available',
      availableVersion: null,
    });
  });

  test('a failed check is attributed to the check', async () => {
    const { updater, fake } = make();
    fake!.checkImpl = async () => {
      fake!.emit('checking-for-update');
      throw new Error('net::ERR_INTERNET_DISCONNECTED');
    };
    expect(await updater.check()).toMatchObject({
      status: 'error',
      failedAction: 'check',
      error: 'net::ERR_INTERNET_DISCONNECTED',
    });
  });

  test('a failed download is attributed to the download, whether it rejects or emits', async () => {
    // rejects (the unsigned-build case: the check succeeds, the download refuses)
    let m = make();
    await m.updater.check();
    m.fake!.downloadImpl = async () => {
      throw new Error('Could not get code signature for running application');
    };
    expect(await m.updater.download()).toMatchObject({
      status: 'error',
      failedAction: 'download',
      error: 'Could not get code signature for running application',
    });

    // emits 'error' mid-transfer and resolves
    m = make();
    await m.updater.check();
    m.fake!.downloadImpl = async () => {
      m.fake!.emit('download-progress', { percent: 10 });
      m.fake!.emit('error', new Error('sha512 checksum mismatch'));
    };
    expect(await m.updater.download()).toMatchObject({
      status: 'error',
      failedAction: 'download',
      progress: null,
    });
    // the 'error' event and the rejection are the same failure — logged once as a failure
    expect(m.logs.filter((l) => /download failed/.test(l))).toHaveLength(1);
  });

  test('download and install are no-ops outside their states', async () => {
    const { updater, fake } = make();
    expect(await updater.download()).toMatchObject({ status: 'idle' });
    updater.install();
    expect(fake!.installed).toBe(0);
  });

  test('a failed install is attributed to the install', async () => {
    const { updater, fake } = make();
    await updater.check();
    await updater.download();
    fake!.installImpl = () => {
      throw new Error('EACCES');
    };
    updater.install();
    expect(updater.getState()).toMatchObject({ status: 'error', failedAction: 'install' });
  });

  test('the next check clears a previous error', async () => {
    const { updater, fake } = make();
    fake!.checkImpl = async () => {
      throw new Error('offline');
    };
    await updater.check();
    fake!.checkImpl = async () => {
      fake!.emit('checking-for-update');
      fake!.emit('update-not-available');
    };
    expect(await updater.check()).toMatchObject({
      status: 'not-available',
      error: null,
      failedAction: null,
    });
  });

  test('setAutoCheck persists through the injected setting', () => {
    const m = make();
    expect(m.updater.setAutoCheck(false).autoCheck).toBe(false);
    expect(m.auto()).toBe(false);
  });
});
