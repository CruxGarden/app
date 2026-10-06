import { expect, it, vi } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { SqliteCruxService } from './crux.service';

const native = localApiFixture();
const service = new SqliteCruxService();

it('commits mixed native patches without losing independent metadata across restart', async () => {
  const row = await service.create({ title: 'Before', meta: { retained: true } });
  const run = vi.spyOn(native().client, 'run');
  await Promise.all([
    service.update(row.id, {
      title: 'After',
      remoteId: 'remote-reference',
      kind: null,
      meta: { changed: 'ui' },
    }),
    service.update(row.id, { description: 'Independent writer', meta: { concurrent: 'agent' } }),
  ]);
  expect(run).not.toHaveBeenCalled();
  await native().restart();
  expect(await service.findById(row.id)).toMatchObject({
    title: 'After',
    remoteId: 'remote-reference',
    kind: null,
    description: 'Independent writer',
    meta: { retained: true, concurrent: 'agent', changed: 'ui' },
  });
});

it('rolls back a real storage failure without a partial edit and permits retry', async () => {
  const row = await service.create({ title: 'Before', meta: { retained: true } });
  await native().faultSql(
    "CREATE TRIGGER refuse_edit BEFORE UPDATE ON cruxes BEGIN SELECT RAISE(ABORT, 'No edit'); END",
  );
  await expect(
    service.update(row.id, { title: 'After', meta: { changed: true } }),
  ).rejects.toThrow();
  expect(await service.findById(row.id)).toMatchObject({
    title: 'Before',
    meta: { retained: true },
  });
  await native().faultSql('DROP TRIGGER refuse_edit');
  await native().restart();
  expect(await service.update(row.id, { title: 'After', meta: { changed: true } })).toMatchObject({
    title: 'After',
    meta: { retained: true, changed: true },
  });
});

it('refuses a colliding slug without applying the other fields', async () => {
  const row = await service.create({ title: 'Before', meta: { retained: true } });
  await service.create({ title: 'Occupied' });
  await expect(
    service.update(row.id, { slug: 'occupied', title: 'Changed', meta: { unsafe: true } }),
  ).rejects.toThrow(/slug/i);
  expect(await service.findById(row.id)).toMatchObject({
    title: 'Before',
    slug: 'before',
    meta: { retained: true },
  });
});

it('captures nested edit input before asynchronous Task lookup', async () => {
  const row = await service.create({ title: 'Before' });
  const patch = { title: 'Intended', meta: { nested: { intended: true } } };
  const pending = service.update(row.id, patch);
  patch.title = 'Caller changed';
  patch.meta.nested.intended = false;
  await pending;
  await native().restart();
  expect(await service.findById(row.id)).toMatchObject({
    title: 'Intended',
    meta: { nested: { intended: true } },
  });
});
