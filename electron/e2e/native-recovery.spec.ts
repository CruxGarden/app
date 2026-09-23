import { test, expect } from '@playwright/test';
import { launchApp } from './launch';

test('native restore refuses invalid and unsupported images before replacing existing records', async () => {
  const instance = await launchApp();
  try {
    const result = await instance.app.evaluate(async ({ app }) => {
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteNative } = load('./dist/sqlite-native.js');
      const root = app.getPath('userData');
      const current = new SqliteNative(
        path.join(root, 'protected.db'),
        path.join(root, 'protected-blobs'),
      );
      const candidate = new SqliteNative(
        path.join(root, 'candidate.db'),
        path.join(root, 'candidate-blobs'),
      );
      try {
        current.run('INSERT INTO settings VALUES (?, ?)', ['protected', 'original']);
        candidate.run('INSERT INTO settings VALUES (?, ?)', ['incoming', 'replacement']);
        const valid = candidate.export();
        candidate.run('INSERT INTO schema_version VALUES (99)');
        const future = candidate.export();
        candidate.run('DELETE FROM schema_version');
        candidate.run('DROP TABLE authors');
        const incomplete = candidate.export();
        const outcomes = [];
        for (const [name, image] of [
          ['corrupt', new Uint8Array([1, 2, 3]).buffer],
          ['future', future],
          ['missing table', incomplete],
        ]) {
          let error = '';
          try {
            current.import(image);
          } catch (caught) {
            error = String(caught);
          }
          let original;
          try {
            original = current.get('SELECT value FROM settings WHERE key = ?', [
              'protected',
            ])?.value;
          } catch {
            original = null;
          }
          outcomes.push({ name, error, original });
        }
        // The same owner remains usable, and a valid retry replaces its records.
        let retryError = '';
        try {
          current.import(valid);
        } catch (caught) {
          retryError = String(caught);
        }
        let incoming;
        try {
          incoming = current.get('SELECT value FROM settings WHERE key = ?', ['incoming'])?.value;
        } catch {
          incoming = null;
        }
        return { outcomes, retryError, incoming };
      } finally {
        try {
          current.close();
        } catch {
          /* a failed legacy import can leave it closed */
        }
        candidate.close();
      }
    });
    for (const outcome of result.outcomes) {
      expect(outcome.error, outcome.name).not.toBe('');
      expect(outcome.original, outcome.name).toBe('original');
    }
    expect(result.retryError).toBe('');
    expect(result.incoming).toBe('replacement');
  } finally {
    await instance.app.close();
  }
});

test('partial database writes and failed renames preserve current records through reopen and retry', async () => {
  const instance = await launchApp();
  try {
    const outcomes = await instance.app.evaluate(({ app }) => {
      const fs = process.getBuiltinModule('fs');
      const path = process.getBuiltinModule('path');
      const load = process
        .getBuiltinModule('module')
        .createRequire(path.join(app.getAppPath(), 'package.json'));
      const { SqliteNative } = load('./dist/sqlite-native.js');
      const root = path.join(app.getPath('userData'), 'restore-faults');
      const candidate = new SqliteNative(
        path.join(root, 'candidate.db'),
        path.join(root, 'candidate-blobs'),
      );
      candidate.run('INSERT INTO settings VALUES (?, ?)', ['incoming', 'replacement']);
      const image = candidate.export();
      candidate.close();
      const write = fs.writeFileSync;
      const rename = fs.renameSync;
      const results = [];
      for (const kind of ['partial-write', 'rename']) {
        const folder = path.join(root, kind);
        const filename = path.join(folder, 'garden.db');
        const blobs = path.join(folder, 'blobs');
        let current = new SqliteNative(filename, blobs);
        current.run('INSERT INTO settings VALUES (?, ?)', ['protected', 'original']);
        let error = '';
        try {
          if (kind === 'partial-write') {
            fs.writeFileSync = ((file, data, options) => {
              if (typeof file === 'string' && path.dirname(file) === folder) {
                write(file, Buffer.from(data as Uint8Array).subarray(0, 7), options);
                throw new Error('Injected partial database write');
              }
              return write(file, data, options);
            }) as typeof fs.writeFileSync;
          } else {
            fs.renameSync = ((from, to) => {
              if (to === filename) throw new Error('Injected database rename failure');
              return rename(from, to);
            }) as typeof fs.renameSync;
          }
          try {
            current.import(image);
          } catch (caught) {
            error = String(caught);
          }
        } finally {
          fs.writeFileSync = write;
          fs.renameSync = rename;
        }
        const read = () => {
          try {
            return (
              current.get('SELECT value FROM settings WHERE key = ?', ['protected'])?.value ?? null
            );
          } catch {
            return null;
          }
        };
        const currentValue = read();
        let reopenedValue = null;
        let retryValue = null;
        try {
          try {
            current.close();
          } catch {
            /* report broken legacy handles as failed assertions */
          }
          current = new SqliteNative(filename, blobs);
          reopenedValue = read();
          current.import(image);
          retryValue = current.get('SELECT value FROM settings WHERE key = ?', ['incoming'])?.value;
        } catch {
          /* preserve failure evidence from the old destructive implementation */
        } finally {
          try {
            current.close();
          } catch {}
        }
        results.push({
          kind,
          error,
          currentValue,
          reopenedValue,
          retryValue,
          files: fs.readdirSync(folder),
        });
      }
      return results;
    });
    for (const result of outcomes) {
      expect.soft(result.error, result.kind).toMatch(/Injected/);
      expect.soft(result.currentValue, result.kind).toBe('original');
      expect.soft(result.reopenedValue, result.kind).toBe('original');
      expect.soft(result.retryValue, result.kind).toBe('replacement');
      expect.soft(result.files.sort(), result.kind).toEqual(['blobs', 'garden.db']);
    }
  } finally {
    await instance.app.close();
  }
});
