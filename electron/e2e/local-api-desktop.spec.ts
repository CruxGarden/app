import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';

const env = { CRUX_API_OWNER: '1' };
test('the desktop UI saves and reopens work through the sole API database owner', async () => {
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    const refused = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      let other: InstanceType<typeof LocalGraphRuntime> | undefined;
      try {
        other = await LocalGraphRuntime.open(path.join(app.getPath('userData'), 'cruxgarden.db'));
        return '';
      } catch (error) {
        return String(error);
      } finally {
        await other?.close();
      }
    });
    expect(refused).toContain('already owned');
    await enterGarden(launch.page);
    const id = await createCrux(launch.page, 'API-owned work');
    await addArtifact(launch.page, 'owner.txt');
    await launch.page.locator('.monaco-editor').click();
    await launch.page.keyboard.type('Saved through the actual API');
    await launch.page.keyboard.press('ControlOrMeta+s');
    const read = () =>
      launch.page.evaluate(async (id) => {
        const db = window.electronAPI!.sqlite;
        const row = (await db.get(
          'SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?',
          [id, 'owner.txt'],
        )) as { fingerprint: string } | undefined;
        return row ? new TextDecoder().decode(await db.blobRead(row.fingerprint)) : null;
      }, id);
    await expect.poll(read).toBe('Saved through the actual API');
    await launch.app.close();
    launch = await launchApp({ dir, env });
    await launch.page.getByRole('button', { name: /enter/i }).click();
    await expect(launch.page.getByRole('button', { name: 'Switch Crux workspace' })).toContainText(
      'API-owned work',
    );
    await expect.poll(read).toBe('Saved through the actual API');
    expect(
      await launch.page.evaluate(() =>
        window.electronAPI!.sqlite.get('SELECT version FROM schema_version'),
      ),
    ).toEqual({ version: 4 });
  } finally {
    await launch.app.close();
  }
});

test('the API storage adapter retains blobs when database rollback requires recovery', async () => {
  const launch = await launchApp();
  try {
    const result = await launch.app.evaluate(async ({ app }) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const { createHash } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load('./dist/sqlite-api.js') as typeof import('../src/sqlite-api');
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const Database = load('better-sqlite3');
      const root = fs.realpathSync(app.getPath('userData'));
      const filename = path.join(root, 'failed-adapter.db');
      const blobDir = path.join(root, 'failed-adapter-blobs');
      const storage = await SqliteApi.open(filename, blobDir);
      const bytes = Buffer.from('Keep this content for recovery');
      const fingerprint = createHash('sha256').update(bytes).digest('hex');
      storage.blobWrite(fingerprint, bytes);
      const candidate = await LocalGraphRuntime.create(path.join(root, 'adapter-incoming.db'));
      const incoming = await candidate.closeWithRecoveryImage();
      const pragma = Database.prototype.pragma;
      const rename = fs.renameSync;
      let fail = true;
      Database.prototype.pragma = function (sql: unknown, ...args: unknown[]) {
        if (fail && this.name === filename && sql === 'foreign_keys = ON') {
          fail = false;
          throw new Error('Injected adapter startup failure');
        }
        return pragma.call(this, sql, ...args);
      };
      fs.renameSync = ((from, to) => {
        if (String(from).endsWith('.recovery'))
          throw new Error('Injected adapter rollback failure');
        return rename(from, to);
      }) as typeof fs.renameSync;
      let importError = '';
      try {
        await storage.import(incoming);
      } catch (error) {
        importError = String(error);
      } finally {
        Database.prototype.pragma = pragma;
        fs.renameSync = rename;
      }
      let deleteError = '';
      try {
        storage.blobDelete(fingerprint);
      } catch (error) {
        deleteError = String(error);
      }
      const retained = fs.existsSync(path.join(blobDir, fingerprint));
      await storage.close().catch(() => undefined);
      return { importError, deleteError, retained };
    });
    expect(result.importError).toContain('recovery required');
    expect(result.deleteError).toContain('recovery required');
    expect(result.retained).toBe(true);
  } finally {
    await launch.app.close();
  }
});
