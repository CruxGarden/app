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
      await db.run(
        "INSERT INTO cruxes (id, author_id, home_id, meta, created, updated) VALUES ('crux', 'author', 'home', ?, 'now', 'now')",
        [
          JSON.stringify({
            authorSnapshots: { old: { avatarFingerprint: 'c'.repeat(64) } },
            personaSnapshots: { old: { thumbnailFingerprint: 'd'.repeat(64) } },
          }),
        ],
      );
      await db.run(
        "INSERT INTO working_copies (id, crux_id, task_id, title, base_snapshot_id, meta, created, updated) VALUES ('copy', 'crux', 'task', 'Task', 'base', ?, 'now', 'now')",
        [JSON.stringify({ authorSnapshots: { old: { avatarFingerprint: 'e'.repeat(64) } } })],
      );
      await db.run(
        "INSERT INTO task_merges VALUES ('review', 'crux', 'copy', 'candidate', 'cancelled', ?, 'now')",
        [JSON.stringify({ manifest: { 'file.bin': { fingerprint: 'f'.repeat(64) } } })],
      );
      for (const [key, value] of Object.entries({
        'cruxgarden:backgroundImage': '0'.repeat(64),
        'cruxgarden:moodAssets': JSON.stringify([
          { fingerprint: '1'.repeat(64), name: 'Retained file' },
        ]),
        'cruxgarden:moodPackages': JSON.stringify([{ cover: '2'.repeat(64) }]),
        'cruxgarden:moodThemeDark': JSON.stringify({ paneBackground: 'asset:' + '3'.repeat(64) }),
      }))
        await db.run('INSERT INTO settings VALUES (?, ?)', [key, value]);
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
      await db.run('DROP TABLE working_copies');
      await db.run('DROP TABLE task_merges');
      const legacy = await db.inspectImport(await db.export());
      return {
        first,
        second,
        afterFailure,
        legacy,
        invalidRefused,
        intact: incoming.byteLength === length,
        current: await db.get('SELECT value FROM settings WHERE key = ?', ['keep']),
      };
    } finally {
      await db.close();
    }
  });
  const all = ['0', '1', '2', '3', 'a', 'b', 'c', 'd', 'e', 'f'].map((digit) => digit.repeat(64));
  expect(result).toEqual({
    first: all,
    second: all,
    afterFailure: all,
    legacy: all.filter((fp) => !['e', 'f'].includes(fp[0]!)),
    invalidRefused: true,
    intact: true,
    current: { value: 'current work' },
  });
});
