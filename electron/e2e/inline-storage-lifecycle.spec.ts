import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('inline conversion excludes storage operations and drains before close without a second owner', async () => {
  const launch = await launchApp();
  try {
    const result = await launch.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const { createHash } = process.getBuiltinModule('crypto');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteApi } = load('./dist/sqlite-api.js') as typeof import('../src/sqlite-api');
      const { SqliteNative } = load(
        './dist/sqlite-native.js',
      ) as typeof import('../src/sqlite-native');
      const { NativeBlobStore } = load('./dist/native-blobs.js');
      const { LocalGraphRuntime } = load(
        '@cruxgarden/local-api',
      ) as typeof import('@cruxgarden/local-api');
      const root = app.getPath('userData');
      const filename = path.join(root, 'guarded-owner.db');
      const blobDir = path.join(root, 'guarded-blobs');
      const storage = await SqliteApi.open(filename, blobDir);
      const source = new SqliteNative(
        path.join(root, 'guarded-incoming.db'),
        path.join(root, 'unused-blobs'),
      );
      const bytes = Buffer.from('Inline content admitted before shutdown');
      const fingerprint = createHash('sha256').update(bytes).digest('hex');
      source.run('ALTER TABLE artifacts ADD COLUMN content BLOB');
      source.run(
        `INSERT INTO artifacts (id, resource_id, author_id, home_id, content, created, updated)
        VALUES ('inline', 'crux', 'author', 'home', ?, 'before', 'before')`,
        [bytes],
      );
      const incoming = source.export();
      source.close();
      // A safety image may have pre-existing missing blobs; rollback must still work.
      await storage.run(
        `INSERT INTO artifacts (id, resource_id, author_id, home_id, fingerprint, created, updated)
        VALUES ('old-missing', 'old', 'author', 'home', ?, 'before', 'before')`,
        ['a'.repeat(64)],
      );
      await storage.run('ALTER TABLE artifacts ADD COLUMN content BLOB');
      await storage.run("INSERT INTO settings VALUES ('untouched', 'opaque trigger')");
      await storage.run(
        'CREATE TRIGGER opaque_side_effect AFTER UPDATE ON artifacts BEGIN DELETE FROM settings; END',
      );
      const backup = await storage.export();
      const external = storage.inspectImport(backup);

      storage.blobWrite(fingerprint, bytes);
      const read = NativeBlobStore.prototype.blobRead;
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let pause = true;
      NativeBlobStore.prototype.blobRead = function (fp: string) {
        const value = read.call(this, fp);
        if (pause && fp === fingerprint) {
          pause = false;
          entered();
          return gate.then(() => value);
        }
        return value;
      };
      let imported: Promise<void> | undefined;
      let closed: Promise<void> | undefined;
      let reopened: InstanceType<typeof SqliteApi> | undefined;
      try {
        imported = storage.import(incoming);
        await started;
        const denied: string[] = [];
        for (const operation of [
          () => storage.run("INSERT INTO settings VALUES ('late', 'wrong')"),
          () => storage.get('SELECT 1'),
          () => storage.all('SELECT 1'),
          () => storage.export(),
          () => storage.inspectImport(incoming),
          () => storage.blobWrite(fingerprint, Buffer.from('wrong')),
          () => storage.blobRead(fingerprint),
          () => storage.blobDelete(fingerprint),
          () => storage.blobExists(fingerprint),
          () => storage.blobWipeAll(),
          () => storage.import(incoming),
        ]) {
          try {
            await operation();
            denied.push('ACCEPTED');
          } catch (error) {
            denied.push(String(error));
          }
        }
        let finishedClose = false;
        closed = storage.close().then(() => {
          finishedClose = true;
        });
        await new Promise((resolve) => setImmediate(resolve));
        const closedEarly = finishedClose;
        let other: InstanceType<typeof LocalGraphRuntime> | undefined;
        let ownerError = '';
        try {
          other = await LocalGraphRuntime.open(filename);
        } catch (error) {
          ownerError = String(error);
        } finally {
          await other?.close();
        }
        release();
        await imported;
        await closed;
        reopened = await SqliteApi.open(filename, blobDir);
        const row = await reopened.get('SELECT id, fingerprint FROM artifacts');
        const retained = Array.from(reopened.blobRead(fingerprint));
        await reopened.import(backup);
        const rollback = await reopened.get('SELECT id, fingerprint FROM artifacts');
        return {
          denied,
          closedEarly,
          ownerError,
          row,
          retained,
          rollback,
          fingerprint,
          external,
          opaque: await reopened.get("SELECT value FROM settings WHERE key = 'untouched'"),
          trigger: await reopened.get(
            "SELECT name FROM sqlite_master WHERE name = 'opaque_side_effect'",
          ),
        };
      } finally {
        release();
        NativeBlobStore.prototype.blobRead = read;
        await imported?.catch(() => undefined);
        await closed?.catch(() => undefined);
        await reopened?.close();
        if (!closed) await storage.close();
      }
    });
    expect(result.denied).toHaveLength(11);
    for (const error of result.denied) expect(error).toContain('replacing its database');
    expect(result.closedEarly).toBe(false);
    expect(result.ownerError).toContain('already owned');
    expect(result.row).toEqual({ id: 'inline', fingerprint: result.fingerprint });
    expect(result.retained).toEqual(
      Array.from(Buffer.from('Inline content admitted before shutdown')),
    );
    expect(result.rollback).toEqual({ id: 'old-missing', fingerprint: 'a'.repeat(64) });
    expect(result.external).toEqual(['a'.repeat(64)]);
    expect(result.opaque).toEqual({ value: 'opaque trigger' });
    expect(result.trigger).toEqual({ name: 'opaque_side_effect' });
  } finally {
    await launch.app.close();
  }
});
