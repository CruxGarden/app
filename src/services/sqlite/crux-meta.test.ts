import { expect, it } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { SqliteCruxService } from './crux.service';

const native = localApiFixture();
const service = new SqliteCruxService();

it('merges independent metadata patches through the native owner and survives restart', async () => {
  const row = await service.create({ title: 'Owned command', meta: { retained: true } });
  await Promise.all([
    service.update(row.id, { meta: { changed: 'ui' } }),
    service.update(row.id, { meta: { concurrent: 'agent' } }),
  ]);
  await native().restart();
  expect((await service.findById(row.id)).meta).toEqual({
    retained: true,
    concurrent: 'agent',
    changed: 'ui',
  });
});

it('preserves metadata after an actual owner failure and permits retry', async () => {
  const row = await service.create({ title: 'Refused command', meta: { retained: true } });
  await native().faultSql(
    "CREATE TRIGGER refuse_meta BEFORE UPDATE OF meta ON cruxes BEGIN SELECT RAISE(ABORT, 'No metadata'); END",
  );
  await expect(service.update(row.id, { meta: { unsafe: true } })).rejects.toThrow();
  expect((await service.findById(row.id)).meta).toEqual({ retained: true });
  await native().faultSql('DROP TRIGGER refuse_meta');
  expect((await service.update(row.id, { meta: { safe: true } })).meta).toEqual({
    retained: true,
    safe: true,
  });
});

it('preserves shallow merge semantics and intentional nulls', async () => {
  const row = await service.create({
    title: 'Metadata',
    meta: { retained: true, nested: { old: true }, nullable: 'before' },
  });
  expect(
    (await service.update(row.id, { meta: { nested: { next: true }, nullable: null } })).meta,
  ).toEqual({ retained: true, nested: { next: true }, nullable: null });
});
