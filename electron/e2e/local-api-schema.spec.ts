import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('the packaged API refuses future schemas and recovers interrupted legacy migration across restart', async () => {
  let launch = await launchApp();
  const dir = launch.dir;
  try {
    const result = await launch.app.evaluate(async ({ app }) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const { randomUUID } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteNative } = load('./dist/sqlite-native.js');
      const { LocalGraphRuntime, CruxKind } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const Database = load('better-sqlite3');
      const folder = fs.realpathSync(app.getPath('userData'));
      const futurePath = path.join(folder, 'future.db');
      const future = new SqliteNative(futurePath, path.join(folder, 'future-blobs'));
      future.run('INSERT INTO schema_version VALUES (99)');
      future.close();
      const before = fs.readFileSync(futurePath);
      let futureError = '';
      let futureOwner: InstanceType<typeof LocalGraphRuntime> | undefined;
      try {
        futureOwner = await LocalGraphRuntime.open(futurePath);
      } catch (error) {
        futureError = String(error);
      } finally {
        await futureOwner?.close();
      }
      const futureUnchanged = before.equals(fs.readFileSync(futurePath));
      const filename = path.join(folder, 'legacy-api.db');
      const seed = new SqliteNative(filename, path.join(folder, 'legacy-blobs'));
      const authorId = randomUUID();
      const homeId = randomUUID();
      const rootId = randomUUID();
      seed.run('INSERT INTO schema_version VALUES (2)');
      seed.run("INSERT INTO settings VALUES ('preserved', 'legacy')");
      seed.run(
        'INSERT INTO cruxes (id, slug, kind, title, author_id, home_id, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          rootId,
          rootId,
          'garden',
          'Legacy Garden',
          authorId,
          homeId,
          '2026-09-22T00:00:00.000Z',
          '2026-09-22T00:00:00.000Z',
        ],
      );
      for (const table of ['store', 'working_copies', 'task_merges'])
        seed.run(`DROP TABLE ${table}`);
      seed.run('ALTER TABLE cruxes DROP COLUMN deleted');
      seed.close();
      const exec = Database.prototype.exec;
      Database.prototype.exec = function (sql: unknown) {
        const result = exec.call(this, sql);
        if (sql === 'ALTER TABLE cruxes ADD COLUMN deleted TEXT')
          throw new Error('Injected schema migration interruption');
        return result;
      };
      let migrationError = '';
      let accidental: InstanceType<typeof LocalGraphRuntime> | undefined;
      try {
        accidental = await LocalGraphRuntime.open(filename);
      } catch (error) {
        migrationError = String(error);
      } finally {
        Database.prototype.exec = exec;
        await accidental?.close();
      }
      const raw = new Database(filename, { readonly: true });
      let retained;
      try {
        retained = {
          version: raw.prepare('SELECT version FROM schema_version').get(),
          added: raw
            .prepare(
              "SELECT name FROM sqlite_master WHERE name IN ('store', 'working_copies', 'task_merges')",
            )
            .all(),
          deleted: raw
            .prepare("SELECT name FROM pragma_table_info('cruxes') WHERE name = 'deleted'")
            .all(),
          title: raw.prepare('SELECT title FROM cruxes WHERE id = ?').get(rootId),
        };
      } finally {
        raw.close();
      }
      const owner = await LocalGraphRuntime.open(filename);
      try {
        const child = await owner.execute(({ crux }) =>
          crux.create({ slug: randomUUID(), authorId, homeId, kind: CruxKind.GARDEN }),
        );
        await owner.addGardenMember({ gardenId: rootId, memberId: child.id, authorId, homeId });
        return {
          rootId,
          childId: child.id,
          futureError,
          futureUnchanged,
          migrationError,
          retained,
        };
      } finally {
        await owner.close();
      }
    });
    expect(result.futureError).toContain('Unsupported desktop schema version');
    expect(result.futureUnchanged).toBe(true);
    expect(result.migrationError).toContain('Injected schema migration interruption');
    expect(result.retained).toEqual({
      version: { version: 2 },
      added: [],
      deleted: [],
      title: { title: 'Legacy Garden' },
    });
    await launch.app.close();
    launch = await launchApp({ dir });
    const restored = await launch.app.evaluate(async ({ app }, rootId) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const owner = await LocalGraphRuntime.open(
        path.join(app.getPath('userData'), 'legacy-api.db'),
      );
      try {
        return {
          version: await owner.all('SELECT version FROM schema_version'),
          setting: await owner.get("SELECT value FROM settings WHERE key = 'preserved'"),
          title: (await owner.execute(({ crux }) => crux.findById(rootId))).title,
          members: (await owner.listGardenMembers(rootId)).items.map((item) => item.id),
        };
      } finally {
        await owner.close();
      }
    }, result.rootId);
    expect(restored).toEqual({
      version: [{ version: 4 }],
      setting: { value: 'legacy' },
      title: 'Legacy Garden',
      members: [result.childId],
    });
  } finally {
    await launch.app.close();
  }
});

test('killing Electron during schema DDL leaves the prior schema intact and retryable', async () => {
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
        const { LocalGraphRuntime } = load(
          '@cruxgarden/local-api',
        ) as typeof import('@cruxgarden/local-api');
        const Database = load('better-sqlite3');
        const filename = path.join(app.getPath('userData'), 'killed-migration.db');
        const seed = new SqliteNative(
          filename,
          path.join(app.getPath('userData'), 'migration-blobs'),
        );
        seed.run('INSERT INTO schema_version VALUES (2)');
        seed.run("INSERT INTO settings VALUES ('preserved', 'original')");
        seed.run('DROP TABLE store');
        seed.run('ALTER TABLE cruxes DROP COLUMN deleted');
        seed.close();
        const exec = Database.prototype.exec;
        Database.prototype.exec = function (sql: unknown) {
          const result = exec.call(this, sql);
          if (sql === 'ALTER TABLE cruxes ADD COLUMN deleted TEXT')
            process.kill(process.pid, 'SIGKILL');
          return result;
        };
        await LocalGraphRuntime.open(filename);
      })
      .catch(() => undefined);
    await expect.poll(() => child.signalCode).toBe('SIGKILL');
    launch = await launchApp({ dir });
    const result = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const Database = load('better-sqlite3');
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const filename = path.join(app.getPath('userData'), 'killed-migration.db');
      const raw = new Database(filename, { readonly: true });
      let before;
      try {
        before = {
          version: raw.prepare('SELECT version FROM schema_version').get(),
          store: raw.prepare("SELECT name FROM sqlite_master WHERE name = 'store'").all(),
          deleted: raw
            .prepare("SELECT name FROM pragma_table_info('cruxes') WHERE name = 'deleted'")
            .all(),
          integrity: raw.prepare('PRAGMA integrity_check').get(),
        };
      } finally {
        raw.close();
      }
      const owner = await LocalGraphRuntime.open(filename);
      try {
        return {
          before,
          version: await owner.get('SELECT version FROM schema_version'),
          setting: await owner.get("SELECT value FROM settings WHERE key = 'preserved'"),
        };
      } finally {
        await owner.close();
      }
    });
    expect(result).toEqual({
      before: {
        version: { version: 2 },
        store: [],
        deleted: [],
        integrity: { integrity_check: 'ok' },
      },
      version: { version: 4 },
      setting: { value: 'original' },
    });
  } finally {
    await launch.app.close();
  }
});
