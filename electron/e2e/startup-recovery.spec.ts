import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

for (const phase of ['before', 'after'] as const) {
  test(`startup interrupted ${phase} checkpoint publication preserves the old schema and retries across restart`, async () => {
    let launch = await launchApp();
    const dir = launch.dir;
    const child = launch.app.process();
    try {
      await launch.app
        .evaluate(async ({ app }, phase) => {
          const fs = process.getBuiltinModule('fs');
          const path = process.getBuiltinModule('path');
          const { createHash } = process.getBuiltinModule('crypto');
          const load = process
            .getBuiltinModule('module')
            .createRequire(path.join(app.getAppPath(), 'package.json'));
          const { SqliteNative } = load('./dist/sqlite-native.js');
          const { LocalGraphRuntime } = load(
            '@cruxgarden/local-api',
          ) as typeof import('@cruxgarden/local-api');
          const folder = app.getPath('userData');
          const filename = path.join(folder, 'startup-legacy.db');
          const seed = new SqliteNative(filename, path.join(folder, 'startup-blobs'));
          seed.run('INSERT INTO schema_version VALUES (2)');
          seed.run("INSERT INTO settings VALUES ('preserved', 'old schema')");
          seed.run('CREATE TABLE opaque (bytes BLOB)');
          seed.run("INSERT INTO opaque VALUES (X'00FF80')");
          seed.run('DROP TABLE store');
          seed.run('ALTER TABLE cruxes DROP COLUMN deleted');
          seed.close();
          fs.writeFileSync(
            path.join(folder, 'startup-before.sha256'),
            createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
          );
          const link = fs.linkSync;
          fs.linkSync = function (source, destination) {
            if (String(source).endsWith('.checkpoint') && phase === 'before')
              process.kill(process.pid, 'SIGKILL');
            link(source, destination);
            if (String(source).endsWith('.checkpoint') && phase === 'after')
              process.kill(process.pid, 'SIGKILL');
          };
          await LocalGraphRuntime.open(filename);
        }, phase)
        .catch(() => undefined);
      await expect.poll(() => child.signalCode).toBe('SIGKILL');
      launch = await launchApp({ dir });
      const recovered = await launch.app.evaluate(async ({ app }) => {
        const fs = process.getBuiltinModule('fs');
        const path = process.getBuiltinModule('path');
        const { createHash } = process.getBuiltinModule('crypto');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const Database = load('better-sqlite3');
        const { LocalGraphRuntime } = load(
          '@cruxgarden/local-api',
        ) as typeof import('@cruxgarden/local-api');
        const folder = app.getPath('userData');
        const filename = path.join(folder, 'startup-legacy.db');
        const unchanged =
          createHash('sha256').update(fs.readFileSync(filename)).digest('hex') ===
          fs.readFileSync(path.join(folder, 'startup-before.sha256'), 'utf8');
        const checkpoints = () =>
          fs
            .readdirSync(folder)
            .filter(
              (name) => name.startsWith('.startup-legacy.db.') && name.endsWith('.pre-migration'),
            );
        const published = checkpoints().length;
        const raw = new Database(filename, { readonly: true });
        let before;
        try {
          before = {
            version: raw.prepare('SELECT version FROM schema_version').get(),
            store: raw.prepare("SELECT name FROM sqlite_master WHERE name = 'store'").all(),
            value: raw.prepare('SELECT value FROM settings').get(),
          };
        } finally {
          raw.close();
        }
        const owner = await LocalGraphRuntime.open(filename);
        try {
          const checkpoint = path.join(folder, checkpoints()[0]);
          const old = new Database(checkpoint, { readonly: true });
          let retained;
          try {
            retained = {
              version: old.prepare('SELECT version FROM schema_version').get(),
              store: old.prepare("SELECT name FROM sqlite_master WHERE name = 'store'").all(),
              value: old.prepare('SELECT value FROM settings').get(),
              bytes: old.prepare('SELECT hex(bytes) AS bytes FROM opaque').get(),
              integrity: old.pragma('integrity_check'),
            };
          } finally {
            old.close();
          }
          // A normal reopen must not fire opaque extension triggers unnecessarily.
          await owner.run(
            'CREATE TRIGGER startup_extension AFTER UPDATE ON schema_version BEGIN DELETE FROM settings; END',
          );
          return {
            unchanged,
            published,
            before,
            retained,
            checkpoints: checkpoints(),
            version: await owner.get('SELECT version FROM schema_version'),
          };
        } finally {
          await owner.close();
        }
      });
      expect(recovered.unchanged).toBe(true);
      expect(recovered.published).toBe(phase === 'before' ? 0 : 1);
      expect(recovered.before).toEqual({
        version: { version: 2 },
        store: [],
        value: { value: 'old schema' },
      });
      expect(recovered.retained).toEqual({
        ...recovered.before,
        bytes: { bytes: '00FF80' },
        integrity: [{ integrity_check: 'ok' }],
      });
      expect(recovered.version).toEqual({ version: 4 });
      expect(recovered.checkpoints).toHaveLength(1);
      await launch.app.close();
      launch = await launchApp({ dir });
      const reopened = await launch.app.evaluate(async ({ app }) => {
        const fs = process.getBuiltinModule('fs');
        const path = process.getBuiltinModule('path');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { LocalGraphRuntime } = load(
          '@cruxgarden/local-api',
        ) as typeof import('@cruxgarden/local-api');
        const folder = app.getPath('userData');
        const owner = await LocalGraphRuntime.open(path.join(folder, 'startup-legacy.db'));
        try {
          return {
            value: await owner.get('SELECT value FROM settings'),
            bytes: await owner.get('SELECT hex(bytes) AS bytes FROM opaque'),
            checkpoints: fs
              .readdirSync(folder)
              .filter(
                (name) => name.startsWith('.startup-legacy.db.') && name.endsWith('.pre-migration'),
              ),
          };
        } finally {
          await owner.close();
        }
      });
      expect(reopened).toEqual({
        value: { value: 'old schema' },
        bytes: { bytes: '00FF80' },
        checkpoints: recovered.checkpoints,
      });
    } finally {
      await launch.app.close();
    }
  });
}
