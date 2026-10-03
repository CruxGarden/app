import { expect, it, vi } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { SettingsKey } from '@/lib/constants';
import { ensureLocalAuthor, initServices } from '../index';
import { SqliteAuthorService } from './author.service';

const native = localApiFixture();
const authors = new SqliteAuthorService();

it('preserves local identity when an existing author cannot be read', async () => {
  const services = await initServices();
  const author = await ensureLocalAuthor();
  const before = await native().client.all('SELECT id FROM authors ORDER BY id');
  const read = vi
    .spyOn(services.author, 'findById')
    .mockRejectedValueOnce(new Error('Read unavailable'));
  try {
    await expect(ensureLocalAuthor()).rejects.toThrow('Read unavailable');
    expect(await native().client.all('SELECT id FROM authors ORDER BY id')).toEqual(before);
    expect(await ensureLocalAuthor()).toEqual(author);
  } finally {
    read.mockRestore();
  }
});

it('refuses unavailable native author commands before any SQL mutation', async () => {
  const author = await authors.create({ username: 'retained', displayName: 'retained' });
  const client = native().client;
  const installation = client.installation;
  client.installation = undefined;
  const run = vi.spyOn(client, 'run');
  try {
    await expect(authors.create({ username: 'refused', displayName: 'refused' })).rejects.toThrow(
      'native author',
    );
    await expect(authors.update(author.id, { bio: 'refused' })).rejects.toThrow('native author');
    expect(run).not.toHaveBeenCalled();
    expect(await authors.findById(author.id)).toEqual(author);
    expect(await client.all("SELECT id FROM authors WHERE username = 'refused'")).toEqual([]);
  } finally {
    client.installation = installation;
  }
});

it('rolls back local author creation when recording identity fails, then retries after restart', async () => {
  await initServices();
  const before = await native().client.all('SELECT * FROM authors ORDER BY id');
  await native().faultSql(
    `CREATE TRIGGER refuse_identity BEFORE INSERT ON settings WHEN NEW.key = '${SettingsKey.LocalAuthorId}' BEGIN SELECT RAISE(ABORT, 'Identity refused'); END`,
  );
  await expect(ensureLocalAuthor()).rejects.toThrow('Identity refused');
  expect(await native().client.all('SELECT * FROM authors ORDER BY id')).toEqual(before);
  await native().faultSql('DROP TRIGGER refuse_identity');
  await native().restart();
  const author = await ensureLocalAuthor();
  expect(
    await native().client.get('SELECT value FROM settings WHERE key = ?', [
      SettingsKey.LocalAuthorId,
    ]),
  ).toEqual({ value: author.id });
  await native().restart();
  expect(await ensureLocalAuthor()).toEqual(author);
});

it('merges concurrent profile metadata and preserves it through refusal, retry and restart', async () => {
  const author = await authors.create({ username: 'profile', displayName: 'profile' });
  await Promise.all([
    authors.update(author.id, { meta: { portrait: 'retained' } }),
    authors.update(author.id, { meta: { preference: 'retained' } }),
  ]);
  const saved = await authors.findById(author.id);
  expect(saved.meta).toEqual({ portrait: 'retained', preference: 'retained' });
  await native().faultSql(
    "CREATE TRIGGER refuse_profile BEFORE UPDATE ON authors BEGIN SELECT RAISE(ABORT, 'Profile refused'); END",
  );
  await expect(authors.update(author.id, { displayName: 'New name' })).rejects.toThrow(
    'Profile refused',
  );
  expect(await authors.findById(author.id)).toEqual(saved);
  await native().faultSql('DROP TRIGGER refuse_profile');
  await native().restart();
  await authors.update(author.id, { displayName: 'New name' });
  await native().restart();
  expect(await authors.findById(author.id)).toMatchObject({
    displayName: 'New name',
    meta: saved.meta,
  });
});
