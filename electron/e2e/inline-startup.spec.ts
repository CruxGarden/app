import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden, createCrux, addArtifact } from './multi-crux-helpers';

const env = { CRUX_API_OWNER: '1' };
test('an inline legacy profile starts through the API and reopens its work in the UI', async () => {
  let launch = await launchApp({ env });
  const dir = launch.dir;
  try {
    await enterGarden(launch.page);
    const id = await createCrux(launch.page, 'Legacy startup work');
    await addArtifact(launch.page, 'startup.txt');
    await launch.page.locator('.monaco-editor').click();
    await launch.page.keyboard.type('Inline startup preserved');
    await launch.page.keyboard.press('ControlOrMeta+s');
    await expect
      .poll(async () =>
        launch.page.evaluate(async (id) => {
          const db = window.electronAPI!.sqlite;
          const row = (await db.get(
            'SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?',
            [id, 'startup.txt'],
          )) as { fingerprint: string } | undefined;
          return row ? new TextDecoder().decode(await db.blobRead(row.fingerprint)) : null;
        }, id),
      )
      .toBe('Inline startup preserved');
    const folder = await launch.app.evaluate(({ app }) => app.getPath('userData'));
    await launch.app.close();
    // Use Electron's SQLite ABI to turn the closed synthetic profile into a legacy fixture.
    const seed = await launchApp();
    try {
      await seed.app.evaluate(({ app }, folder) => {
        const fs = process.getBuiltinModule('fs');
        const path = process.getBuiltinModule('path');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const Database = load('better-sqlite3');
        const db = new Database(path.join(folder, 'cruxgarden.db'));
        try {
          db.exec(
            'ALTER TABLE artifacts ADD COLUMN content BLOB; UPDATE schema_version SET version = 1;',
          );
          // Keep the existing Project Folder authoritative and identical; only storage changes.
          const rows = db
            .prepare('SELECT id, fingerprint FROM artifacts WHERE fingerprint IS NOT NULL')
            .all();
          for (const row of rows) {
            const bytes = fs.readFileSync(path.join(folder, 'blobs', row.fingerprint));
            db.prepare('UPDATE artifacts SET content = ?, fingerprint = NULL WHERE id = ?').run(
              bytes,
              row.id,
            );
          }
        } finally {
          db.close();
        }
        // No external blob can accidentally mask an unconverted record.
        for (const name of fs.readdirSync(path.join(folder, 'blobs')))
          if (/^[a-f0-9]{64}$/.test(name)) fs.unlinkSync(path.join(folder, 'blobs', name));
      }, folder);
    } finally {
      await seed.app.close();
    }
    for (let restart = 0; restart < 2; restart++) {
      launch = await launchApp({ dir, env });
      await launch.page.getByRole('button', { name: /enter/i }).click();
      await expect(
        launch.page.getByRole('button', { name: 'Switch Crux workspace' }),
      ).toContainText('Legacy startup work');
      const saved = await launch.page.evaluate(async (id) => {
        const db = window.electronAPI!.sqlite;
        const row = (await db.get(
          'SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?',
          [id, 'startup.txt'],
        )) as { fingerprint: string };
        return {
          bytes: new TextDecoder().decode(await db.blobRead(row.fingerprint)),
          version: await db.get('SELECT version FROM schema_version'),
          inline: await db.all(
            "SELECT name FROM pragma_table_info('artifacts') WHERE name = 'content'",
          ),
        };
      }, id);
      expect(saved).toEqual({
        bytes: 'Inline startup preserved',
        version: { version: 4 },
        inline: [],
      });
      await expect(launch.page.locator('.monaco-editor').first()).toContainText(
        'Inline startup preserved',
      );
      if (restart === 0) await launch.app.close();
    }
  } finally {
    await launch.app.close();
  }
});

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
