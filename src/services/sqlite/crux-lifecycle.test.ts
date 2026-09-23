import { expect, it, vi } from 'vitest';
import { SqliteCruxService } from './crux.service';
import { getSqliteClient } from './client';

it('propagates an owned purge refusal without using the legacy delete path', async () => {
  const service = new SqliteCruxService();
  const crux = await service.create({ title: 'Keep after refusal' });
  const db = getSqliteClient();
  db.deleteCrux = vi.fn(async () => {
    throw new Error('Owner refused');
  });
  const run = vi.spyOn(db, 'run');
  await expect(service.delete(crux.id)).rejects.toThrow('Owner refused');
  expect(run).not.toHaveBeenCalled();
  expect((await service.findById(crux.id)).title).toBe('Keep after refusal');
});
it('sends trash and restore through the owner and preserves refusals', async () => {
  const service = new SqliteCruxService();
  const crux = await service.create({ title: 'Keep alive' });
  const db = getSqliteClient();
  db.setCruxTrashed = vi.fn(async () => {
    throw new Error('Storage refused');
  });
  const run = vi.spyOn(db, 'run');
  await expect(service.trash(crux.id)).rejects.toThrow('Storage refused');
  await expect(service.restore(crux.id)).rejects.toThrow('Storage refused');
  expect(run).not.toHaveBeenCalled();
  expect(await service.listAll()).toContainEqual(expect.objectContaining({ id: crux.id }));
});
