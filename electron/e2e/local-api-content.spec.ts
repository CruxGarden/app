import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

for (const interrupt of [false, true]) {
  test(`inline conversion survives ${interrupt ? 'process termination' : 'failed read-back'} and API replacement/restart`, async () => {
    let launch = await launchApp();
    const dir = launch.dir;
    const child = launch.app.process();
    try {
      const attempt = launch.app.evaluate(async ({ app }, kill) => {
        const fs = process.getBuiltinModule('fs');
        const path = process.getBuiltinModule('path');
        const { createHash } = process.getBuiltinModule('crypto');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { SqliteNative } = load('./dist/sqlite-native.js');
        const { NativeBlobStore } = load('./dist/native-blobs.js');
        const { prepareDesktopContent } = load(
          '@cruxgarden/local-api',
        ) as typeof import('@cruxgarden/local-api');
        const filename = path.join(app.getPath('userData'), 'inline-source.db');
        const blobDir = path.join(app.getPath('userData'), 'inline-blobs');
        const seed = new SqliteNative(filename, blobDir);
        seed.run('INSERT INTO schema_version VALUES (1)');
        seed.run('ALTER TABLE artifacts ADD COLUMN content BLOB');
        seed.run("INSERT INTO settings VALUES ('preserved', 'original')");
        for (const [i, value] of [
          Buffer.from('Dream 🌱\n'),
          Buffer.from([0, 255, 128, 7]),
          Buffer.alloc(0),
        ].entries())
          seed.run(
            `INSERT INTO artifacts (id, resource_id, author_id, home_id, content, created, updated)
            VALUES (?, ?, 'author', 'home', ?, 'before', 'before')`,
            [`file-${i}`, i ? 'history' : 'main', value],
          );
        seed.close();
        const before = fs.readFileSync(filename);
        fs.writeFileSync(
          path.join(app.getPath('userData'), 'inline-source.sha256'),
          createHash('sha256').update(before).digest('hex'),
        );
        const blobs = new NativeBlobStore(blobDir);
        let wrote = false;
        let error = '';
        try {
          await prepareDesktopContent(Uint8Array.from(before).buffer, {
            read: async (fp) =>
              wrote ? Buffer.from('truncated') : blobs.blobExists(fp) ? blobs.blobRead(fp) : null,
            write: async (fp, bytes) => {
              blobs.blobWrite(fp, bytes);
              wrote = true;
              if (kill) process.kill(process.pid, 'SIGKILL');
            },
          });
        } catch (failure) {
          error = String(failure);
        }
        return { error, unchanged: before.equals(fs.readFileSync(filename)) };
      }, interrupt);
      if (interrupt) {
        await attempt.catch(() => undefined);
        await expect.poll(() => child.signalCode).toBe('SIGKILL');
      } else {
        const result = await attempt;
        expect(result?.error).toContain('integrity check');
        expect(result?.unchanged).toBe(true);
        await launch.app.close();
      }
      launch = await launchApp({ dir });
      const converted = await launch.app.evaluate(async ({ app }) => {
        const fs = process.getBuiltinModule('fs');
        const path = process.getBuiltinModule('path');
        const { createHash } = process.getBuiltinModule('crypto');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { NativeBlobStore } = load('./dist/native-blobs.js');
        const { LocalGraphRuntime, prepareDesktopContent } = load(
          '@cruxgarden/local-api',
        ) as typeof import('@cruxgarden/local-api');
        const folder = app.getPath('userData');
        const bytes = fs.readFileSync(path.join(folder, 'inline-source.db'));
        const sourceIntact =
          createHash('sha256').update(bytes).digest('hex') ===
          fs.readFileSync(path.join(folder, 'inline-source.sha256'), 'utf8');
        const blobs = new NativeBlobStore(path.join(folder, 'inline-blobs'));
        let writes = 0;
        const prepared = await prepareDesktopContent(Uint8Array.from(bytes).buffer, {
          read: async (fp) => (blobs.blobExists(fp) ? blobs.blobRead(fp) : null),
          write: async (fp, content) => {
            writes++;
            blobs.blobWrite(fp, content);
          },
        });
        const owner = await LocalGraphRuntime.create(path.join(folder, 'converted-api.db'));
        try {
          await owner.replaceDatabase(prepared.database);
          return {
            sourceIntact,
            writes,
            fingerprints: prepared.fingerprints,
            version: await owner.get('SELECT version FROM schema_version'),
          };
        } finally {
          await owner.close();
        }
      });
      expect(converted.sourceIntact).toBe(true);
      expect(converted.writes).toBe(2); // The first verified write survived either interruption.
      expect(converted.version).toEqual({ version: 4 });
      expect(converted.fingerprints).toHaveLength(3);
      await launch.app.close();
      launch = await launchApp({ dir });
      const restored = await launch.app.evaluate(async ({ app }) => {
        const path = process.getBuiltinModule('path');
        const load = process
          .getBuiltinModule('module')
          .createRequire(path.join(app.getAppPath(), 'package.json'));
        const { NativeBlobStore } = load('./dist/native-blobs.js');
        const { LocalGraphRuntime } = load(
          '@cruxgarden/local-api',
        ) as typeof import('@cruxgarden/local-api');
        const folder = app.getPath('userData');
        const blobs = new NativeBlobStore(path.join(folder, 'inline-blobs'));
        const owner = await LocalGraphRuntime.open(path.join(folder, 'converted-api.db'));
        try {
          const rows = await owner.all<{
            id: string;
            resource_id: string;
            fingerprint: string;
            updated: string;
          }>('SELECT id, resource_id, fingerprint, updated FROM artifacts ORDER BY id');
          return {
            files: rows.map((row) => ({
              id: row.id,
              resource: row.resource_id,
              updated: row.updated,
              bytes: Array.from(blobs.blobRead(row.fingerprint)),
            })),
            setting: await owner.get("SELECT value FROM settings WHERE key = 'preserved'"),
            inline: await owner.all(
              "SELECT name FROM pragma_table_info('artifacts') WHERE name = 'content'",
            ),
          };
        } finally {
          await owner.close();
        }
      });
      expect(restored).toEqual({
        files: [Buffer.from('Dream 🌱\n'), Buffer.from([0, 255, 128, 7]), Buffer.alloc(0)].map(
          (bytes, i) => ({
            id: `file-${i}`,
            resource: i ? 'history' : 'main',
            updated: 'before',
            bytes: Array.from(bytes),
          }),
        ),
        setting: { value: 'original' },
        inline: [],
      });
    } finally {
      await launch.app.close();
    }
  });
}
