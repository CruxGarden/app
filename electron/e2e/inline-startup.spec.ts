import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

/**
 * The API's inline-content migration (schema 1 → 4) survives being killed
 * between extraction and the schema commit: the retained checkpoint lets the
 * next open finish the conversion. (The UI half of the old spec — a legacy
 * inline profile reopening its work — is gone with the clean slate: Crux files
 * are manifest projections now, not artifacts rows, and old-format profiles
 * are out of scope.)
 */
test('termination after inline extraction but before schema commit retains inline files for startup retry', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  const child = launch.app.process();
  try {
    await launch.app
      .evaluate(async ({ app }) => {
        const path = process.getBuiltinModule('path');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { SqliteNative } = load('./dist/sqlite-native.js');
        const { SqliteApi } = load('./dist/sqlite-api.js');
        const Database = load('better-sqlite3');
        const folder = app.getPath('userData');
        const filename = path.join(folder, 'inline-startup.db');
        const blobDir = path.join(folder, 'inline-startup-blobs');
        const seed = new SqliteNative(filename, blobDir);
        seed.run('INSERT INTO schema_version VALUES (1)');
        seed.run('ALTER TABLE artifacts ADD COLUMN content BLOB');
        seed.run(
          "INSERT INTO artifacts (id, resource_id, author_id, home_id, content, created, updated) VALUES ('file', 'crux', 'author', 'home', ?, 'before', 'before')",
          [Buffer.from([0, 255, 128])],
        );
        seed.close();
        const exec = Database.prototype.exec;
        Database.prototype.exec = function (sql: string) {
          if (sql === 'UPDATE schema_version SET version = 4') process.kill(process.pid, 'SIGKILL');
          return exec.call(this, sql);
        };
        await SqliteApi.open(filename, blobDir);
      })
      .catch(() => undefined);
    await expect.poll(() => child.signalCode).toBe('SIGKILL');
    launch = await launchApp({ dir });
    const result = await launch.app.evaluate(async ({ app }) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const Database = load('better-sqlite3');
      const { SqliteApi } = load('./dist/sqlite-api.js');
      const folder = app.getPath('userData');
      const filename = path.join(folder, 'inline-startup.db');
      const raw = new Database(filename, { readonly: true });
      let before;
      try {
        before = {
          version: raw.prepare('SELECT version FROM schema_version').get(),
          file: raw.prepare('SELECT hex(content) AS bytes, fingerprint FROM artifacts').get(),
        };
      } finally {
        raw.close();
      }
      const owner = await SqliteApi.open(filename, path.join(folder, 'inline-startup-blobs'));
      try {
        const row = await owner.get('SELECT fingerprint FROM artifacts');
        return {
          before,
          bytes: Array.from(owner.blobRead(row.fingerprint)),
          version: await owner.get('SELECT version FROM schema_version'),
          checkpoints: fs
            .readdirSync(folder)
            .filter(
              (name) => name.startsWith('.inline-startup.db.') && name.endsWith('.pre-migration'),
            ).length,
        };
      } finally {
        await owner.close();
      }
    });
    expect(result).toEqual({
      before: { version: { version: 1 }, file: { bytes: '00FF80', fingerprint: null } },
      bytes: [0, 255, 128],
      version: { version: 4 },
      checkpoints: 1,
    });
  } finally {
    await launch.app.close();
  }
});
