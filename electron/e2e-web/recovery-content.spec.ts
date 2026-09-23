import { test, expect } from '@playwright/test';

test('browser SQLite inspects incoming content without replacing current records or consuming the input', async ({
  page,
}) => {
  // Empty same-origin document: the test owns the only SQLite worker/profile.
  await page.route('**/recovery-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Recovery fixture</title>',
    }),
  );
  await page.goto('/recovery-fixture');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/sqlite/client.ts';
    const { SqliteClient } = await import(modulePath);
    const db = new SqliteClient();
    await db.init();
    try {
      const fingerprint = 'a'.repeat(64);
      const avatar = 'b'.repeat(64);
      await db.run(
        'INSERT INTO artifacts (id, resource_id, author_id, home_id, fingerprint, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['file', 'history', 'author', 'home', fingerprint, 'now', 'now'],
      );
      await db.run('INSERT INTO authors (id, meta, created, updated) VALUES (?, ?, ?, ?)', [
        'author',
        JSON.stringify({ avatarFingerprint: avatar }),
        'now',
        'now',
      ]);
      const incoming = await db.export();
      const length = incoming.byteLength;
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['keep', 'current work']);
      const first = await db.inspectImport(incoming);
      const second = await db.inspectImport(incoming);
      let invalidRefused = false;
      try {
        await db.inspectImport(new ArrayBuffer(256));
      } catch {
        invalidRefused = true;
      }
      const afterFailure = await db.inspectImport(incoming);
      return {
        first,
        second,
        afterFailure,
        invalidRefused,
        intact: incoming.byteLength === length,
        current: await db.get('SELECT value FROM settings WHERE key = ?', ['keep']),
      };
    } finally {
      await db.close();
    }
  });
  expect(result).toEqual({
    first: ['a'.repeat(64), 'b'.repeat(64)],
    second: ['a'.repeat(64), 'b'.repeat(64)],
    afterFailure: ['a'.repeat(64), 'b'.repeat(64)],
    invalidRefused: true,
    intact: true,
    current: { value: 'current work' },
  });
});
