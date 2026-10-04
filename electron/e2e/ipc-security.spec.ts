import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './launch';

test('an unrelated renderer with the preload cannot read or change the Garden', async () => {
  const instance = await launchApp();
  try {
    const folder = await instance.page.evaluate(() =>
      window.electronAPI!.project.createFolder('ipc-proof'),
    );
    const extraWindow = instance.app.waitForEvent('window');
    await instance.app.evaluate(async ({ BrowserWindow, app }) => {
      const path = process.getBuiltinModule('path');
      const extra = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: path.join(app.getAppPath(), 'dist/preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      await extra.loadURL('about:blank');
    });
    const extra = await extraWindow;
    const results = await extra.evaluate(async (folder) => {
      const api = window.electronAPI!;
      const calls = [
        () => api.desktop.config(),
        () => api.desktop.readMemory(),
        () => api.desktop.writeMemory('Untrusted', null),
        () => api.project.writeFile(folder, 'untrusted.txt', new TextEncoder().encode('untrusted')),
        () => api.project.listFiles(folder),
        () => api.preview.start(folder),
        () => api.updates.state(),
        () => api.packageImports!.pending(),
        () => api.packageImports!.read('untrusted'),
        () => api.packageImports!.dismiss('untrusted'),
        () => api.native.run({ cruxId: 'missing', tool: 'pandoc', args: [] }),
      ];
      return Promise.all(
        calls.map(async (call) => {
          try {
            await call();
            return 'NOT REFUSED';
          } catch (error) {
            return (error as Error).message;
          }
        }),
      );
    }, folder);
    for (const result of results) expect.soft(result).toContain('only available to Crux Garden');
    expect(existsSync(join(folder, 'untrusted.txt'))).toBe(false);
    await extra.close();
    // Normal app calls still work after rejected requests.
    await instance.page.evaluate(
      (folder) =>
        window.electronAPI!.project.writeFile(
          folder,
          'trusted.txt',
          new TextEncoder().encode('trusted'),
        ),
      folder,
    );
    expect(existsSync(join(folder, 'trusted.txt'))).toBe(true);
  } finally {
    await instance.app.close();
  }
});

test('one-way replies require the live main frame and app navigation uses exact origins', async () => {
  const instance = await launchApp();
  try {
    const result = await instance.app.evaluate(({ app, BrowserWindow, ipcMain }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { gardenIpc, isGardenUrl } = load(
        './dist/garden-ipc.js',
      ) as typeof import('../src/garden-ipc');
      const window = BrowserWindow.getAllWindows()[0];
      const sender = window.webContents;
      const accepted: string[] = [];
      let owner: typeof window | null = window;
      gardenIpc(() => owner).on('security:reply-proof', (_event, value) => accepted.push(value));
      try {
        ipcMain.emit('security:reply-proof', { sender, senderFrame: sender.mainFrame }, 'main');
        ipcMain.emit(
          'security:reply-proof',
          { sender, senderFrame: { url: sender.mainFrame.url } },
          'child',
        );
        ipcMain.emit('security:reply-proof', { sender, senderFrame: null }, 'detached');
        ipcMain.emit(
          'security:reply-proof',
          { sender: {}, senderFrame: sender.mainFrame },
          'other-window',
        );
        owner = null;
        ipcMain.emit('security:reply-proof', { sender, senderFrame: sender.mainFrame }, 'closed');
      } finally {
        ipcMain.removeAllListeners('security:reply-proof');
      }
      const dev = 'http://localhost:8080';
      return {
        accepted,
        allowed: ['crux-app:///index.html', sender.mainFrame.url, dev + '/c/example'].map((url) =>
          isGardenUrl(url, dev),
        ),
        refused: [
          'https://example.com',
          dev + '.example.com',
          'http://localhost:80801',
          'http://localhost:8080@example.com',
          'crux-app://evil/index.html',
        ].map((url) => isGardenUrl(url, dev)),
        noDev: isGardenUrl(dev),
      };
    });
    expect(result.accepted).toEqual(['main']);
    expect(result.allowed).toEqual([true, true, true]);
    expect(result.refused).toEqual([false, false, false, false, false]);
    expect(result.noDev).toBe(false);
  } finally {
    await instance.app.close();
  }
});

test('the packaged database owner refuses writes through both SQL read methods', async () => {
  const instance = await launchApp();
  try {
    const evidence = await instance.page.evaluate(async () => {
      const sqlite = window.electronAPI!.sqlite;
      await sqlite.run(
        "INSERT INTO settings (key, value) VALUES ('ipc-read-boundary', 'unchanged')",
      );
      const refusals: string[] = [];
      for (const method of ['get', 'all'] as const) {
        try {
          await sqlite[method](
            "WITH changed AS (SELECT 'bad' AS value) UPDATE settings SET value = (SELECT value FROM changed) WHERE key = 'ipc-read-boundary' RETURNING value",
          );
          refusals.push('NOT REFUSED');
        } catch (error) {
          refusals.push((error as Error).message);
        }
      }
      return {
        refusals,
        row: await sqlite.get("SELECT value FROM settings WHERE key = 'ipc-read-boundary'"),
        words: await sqlite.get("SELECT 'INSERT UPDATE DELETE' AS value"),
      };
    });
    expect(evidence.refusals).toHaveLength(2);
    for (const refusal of evidence.refusals) expect(refusal).toContain('read-only');
    expect(evidence.row).toEqual({ value: 'unchanged' });
    expect(evidence.words).toEqual({ value: 'INSERT UPDATE DELETE' });
  } finally {
    await instance.app.close();
  }
});
