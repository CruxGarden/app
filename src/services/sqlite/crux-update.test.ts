import { expect, it, vi } from 'vitest';
import { getSqliteClient } from './client';
import { SqliteCruxService } from './crux.service';

it('sends the intended mixed patch through the owned command without a stale metadata read', async () => {
  const service = new SqliteCruxService();
  const row = await service.create({ title: 'Before', meta: { retained: true } });
  const db = getSqliteClient();
  const update = vi.fn(async () => {
    await db.run('UPDATE cruxes SET title = ?, meta = ? WHERE id = ?', [
      'After',
      JSON.stringify({ retained: true, concurrent: 'agent', changed: 'ui' }),
      row.id,
    ]);
  });
  db.updateCrux = update;
  const patch = {
    title: 'After',
    remoteId: 'remote-reference',
    kind: null,
    meta: { changed: 'ui' },
  };
  const result = await service.update(row.id, patch);
  expect(update).toHaveBeenCalledExactlyOnceWith(row.id, patch);
  expect(result.title).toBe('After');
  expect(result.meta).toEqual({ retained: true, concurrent: 'agent', changed: 'ui' });
});

it('refuses the complete edit on owner failure without a legacy fallback', async () => {
  const service = new SqliteCruxService();
  const row = await service.create({ title: 'Before', meta: { retained: true } });
  getSqliteClient().updateCrux = vi.fn().mockRejectedValue(new Error('Owner is replacing'));
  await expect(service.update(row.id, { title: 'After', meta: { changed: true } })).rejects.toThrow(
    'replacing',
  );
  expect(await service.findById(row.id)).toMatchObject({
    title: 'Before',
    meta: { retained: true },
  });
});

it('retains mixed update behavior for backends without the named command', async () => {
  const service = new SqliteCruxService();
  const row = await service.create({ title: 'Before', meta: { retained: true } });
  expect(getSqliteClient().updateCrux).toBeUndefined();
  expect(
    await service.update(row.id, { title: 'After', kind: null, meta: { changed: true } }),
  ).toMatchObject({ title: 'After', kind: null, meta: { retained: true, changed: true } });
});
