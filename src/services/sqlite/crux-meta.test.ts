import { expect, it, vi } from 'vitest';
import { getSqliteClient } from './client';
import { SqliteCruxService } from './crux.service';

it('sends only the intended metadata patch to an owning backend through the shared Crux service', async () => {
  const crux = new SqliteCruxService();
  const row = await crux.create({ title: 'Owned command', meta: { retained: true } });
  const db = getSqliteClient();
  const merge = vi.fn(async (id: string, patch: Record<string, unknown>) => {
    // Represents a backend command; an additional writer's latest field must
    // survive because the service sends a patch, never its own stale whole meta.
    await db.run('UPDATE cruxes SET meta = ? WHERE id = ?', [
      JSON.stringify({ retained: true, concurrent: 'agent', ...patch }),
      id,
    ]);
  });
  db.mergeCruxMeta = merge;
  const updated = await crux.update(row.id, { meta: { changed: 'ui' } });
  expect(merge).toHaveBeenCalledExactlyOnceWith(row.id, { changed: 'ui' });
  expect(updated.meta).toEqual({ retained: true, concurrent: 'agent', changed: 'ui' });
});

it('propagates an owned command failure without falling back to an uncoordinated write', async () => {
  const crux = new SqliteCruxService();
  const row = await crux.create({ title: 'Refused command', meta: { retained: true } });
  getSqliteClient().mergeCruxMeta = vi.fn().mockRejectedValue(new Error('Owner is replacing'));
  await expect(crux.update(row.id, { meta: { unsafe: true } })).rejects.toThrow('replacing');
  expect((await crux.findById(row.id)).meta).toEqual({ retained: true });
});

it('keeps metadata merging available through a backend without the named capability', async () => {
  const crux = new SqliteCruxService();
  const row = await crux.create({ title: 'Legacy fallback', meta: { retained: true } });
  expect(getSqliteClient().mergeCruxMeta).toBeUndefined();
  expect((await crux.update(row.id, { meta: { changed: true } })).meta).toEqual({
    retained: true,
    changed: true,
  });
});
