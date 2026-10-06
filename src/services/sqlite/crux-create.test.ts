import { expect, it, vi } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { SqliteCruxService } from './crux.service';
import { getLocalIdentity } from './identity';
import { stat } from 'node:fs/promises';

const native = localApiFixture();
const service = new SqliteCruxService();

it('uses native slug allocation across concurrent creation and Trash, with real Project Folders', async () => {
  const first = await service.create({ title: 'Owner', type: 'workspace' });
  await service.trash(first.id);
  const rows = await Promise.all(
    Array.from({ length: 3 }, () => service.create({ title: 'Owner', type: 'workspace' })),
  );
  expect(rows.map((row) => row.slug).sort()).toEqual(['owner-2', 'owner-3', 'owner-4']);
  expect(new Set(rows.map((row) => row.meta?.projectFolder)).size).toBe(3);
  for (const row of rows)
    expect((await stat(row.meta!.projectFolder as string)).isDirectory()).toBe(true);
  await native().restart();
  for (const row of rows)
    expect(await service.findById(row.id)).toMatchObject({ slug: row.slug, meta: row.meta });
});

it('propagates real creation refusal without a partial row, then retries after restart', async () => {
  await getLocalIdentity();
  const before = await native().client.all('SELECT id FROM cruxes ORDER BY id');
  await native().faultSql(
    "CREATE TRIGGER refuse_create BEFORE INSERT ON cruxes BEGIN SELECT RAISE(ABORT, 'No create'); END",
  );
  const run = vi.spyOn(native().client, 'run');
  await expect(service.create({ title: 'No partial work' })).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
  expect(await native().client.all('SELECT id FROM cruxes ORDER BY id')).toEqual(before);
  await native().faultSql('DROP TRIGGER refuse_create');
  await native().restart();
  const created = await service.create({ title: 'No partial work' });
  expect(created.slug).toBe('no-partial-work');
});

it('captures nested input before resolving identity', async () => {
  const input = { title: 'Original', meta: { notes: 'Original' } };
  const pending = service.create(input);
  input.title = 'Changed';
  input.meta.notes = 'Changed';
  const created = await pending;
  expect(created).toMatchObject({ title: 'Original', meta: { notes: 'Original' } });
  await native().restart();
  expect(await service.findById(created.id)).toMatchObject({
    title: 'Original',
    meta: { notes: 'Original' },
  });
});
