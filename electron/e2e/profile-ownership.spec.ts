import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { symlinkSync } from 'node:fs';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';

for (const profilePath of ['direct', 'alias'] as const) {
  test(`${profilePath} profile path refuses a second desktop process before storage startup and reveals its existing window`, async () => {
    const launch = await launchApp();
    try {
      await enterGarden(launch.page);
      const id = await createCrux(launch.page, 'The original workspace');
      if (profilePath === 'alias') {
        await addArtifact(launch.page, 'unfinished.txt');
        await launch.page.locator('.monaco-editor').click();
        await launch.page.keyboard.type('Keep this unfinished');
        await expect(launch.page.locator('.monaco-editor')).toContainText('Keep this unfinished');
        await launch.app.evaluate(({ app }) => app.quit());
        const dialog = launch.page.getByRole('dialog', { name: 'Close Crux Garden' });
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).not.toBeVisible();
      }
      const alias = join(launch.dir, 'profile-alias');
      symlinkSync(launch.dir, alias, 'junction');
      const host = await launch.app.evaluate(({ app, BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].hide();
        return { executable: process.execPath, packaged: app.isPackaged };
      });
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        CRUX_TEST_PROFILE: profilePath === 'alias' ? alias : launch.dir,
        CRUX_SILENT: '1',
      };
      delete childEnv.ELECTRON_RUN_AS_NODE;
      const child = spawn(host.executable, host.packaged ? [] : ['.'], {
        cwd: join(__dirname, '..'),
        env: childEnv,
        stdio: 'ignore',
      });
      const result = await new Promise<{ code: number | null; signal: string | null }>(
        (resolve, reject) => {
          const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
          child.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.once('exit', (code, signal) => {
            clearTimeout(timer);
            resolve({ code, signal });
          });
        },
      );
      expect(result).toEqual({ code: 0, signal: null });
      await expect
        .poll(() =>
          launch.app.evaluate(({ BrowserWindow }) => {
            const windows = BrowserWindow.getAllWindows();
            return { count: windows.length, visible: windows[0]?.isVisible() };
          }),
        )
        .toEqual({ count: 1, visible: true });
      await expect(
        launch.page.getByRole('button', { name: 'Switch Crux workspace' }),
      ).toContainText('The original workspace');
      if (profilePath === 'alias')
        await expect(launch.page.locator('.monaco-editor')).toContainText('Keep this unfinished');
      await expect(
        launch.page.evaluate(
          (id) =>
            window.electronAPI!.sqlite.get('SELECT COUNT(*) AS count FROM cruxes WHERE id = ?', [
              id,
            ]),
          id,
        ),
      ).resolves.toEqual({ count: 1 });
    } finally {
      await launch.app.close();
    }
  });
}

test('distinct profiles remain independent and ownership releases after quit and process termination', async () => {
  let first = await launchApp();
  const dir = first.dir;
  const second = await launchApp();
  try {
    await first.page.evaluate(() =>
      window.electronAPI!.sqlite.run("INSERT INTO settings VALUES ('ownership-test', 'first')"),
    );
    await second.page.evaluate(() =>
      window.electronAPI!.sqlite.run("INSERT INTO settings VALUES ('ownership-test', 'second')"),
    );
    await first.app.close();
    first = await launchApp({ dir });
    expect(
      await first.page.evaluate(() =>
        window.electronAPI!.sqlite.get("SELECT value FROM settings WHERE key = 'ownership-test'"),
      ),
    ).toEqual({ value: 'first' });
    const child = first.app.process();
    child.kill('SIGKILL');
    await expect.poll(() => child.signalCode).toBe('SIGKILL');
    first = await launchApp({ dir });
    expect(
      await first.page.evaluate(() =>
        window.electronAPI!.sqlite.get("SELECT value FROM settings WHERE key = 'ownership-test'"),
      ),
    ).toEqual({ value: 'first' });
    expect(
      await second.page.evaluate(() =>
        window.electronAPI!.sqlite.get("SELECT value FROM settings WHERE key = 'ownership-test'"),
      ),
    ).toEqual({ value: 'second' });
  } finally {
    await first.app.close();
    await second.app.close();
  }
});
