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
