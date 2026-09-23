import { expect, it, vi } from 'vitest';
import { getSqliteClient } from './client';
import { SqliteCruxService } from './crux.service';
import { getLocalIdentity } from './identity';

it('uses the owner result and never performs a legacy insert after admission', async () => {
  const service = new SqliteCruxService();
  const committed = await service.create({ title: 'Owner allocated', slug: 'owner-2' });
  const db = getSqliteClient();
  db.createCrux = vi.fn(async () => committed.id);
  const run = vi.spyOn(db, 'run');
  const result = await service.create({ title: 'Requested', slug: 'owner', type: 'workspace' });
  expect(result.id).toBe(committed.id);
  expect(result.slug).toBe('owner-2');
  expect(db.createCrux).toHaveBeenCalledWith(
    expect.objectContaining({ slug: 'owner', title: 'Requested', type: 'workspace' }),
  );
  expect(run).not.toHaveBeenCalled();
});

it('propagates creation refusal without legacy SQL or success', async () => {
  await getLocalIdentity();
  const db = getSqliteClient();
  db.createCrux = vi.fn(async () => {
    throw new Error('Folder preparation refused');
  });
  const run = vi.spyOn(db, 'run');
  await expect(new SqliteCruxService().create({ title: 'No partial work' })).rejects.toThrow(
    'Folder preparation refused',
  );
  expect(run).not.toHaveBeenCalled();
  expect(await db.all('SELECT id FROM cruxes')).toEqual([]);
});

it('captures nested input before resolving identity', async () => {
  const service = new SqliteCruxService();
  const input = { title: 'Original', meta: { notes: 'Original' } };
  const pending = service.create(input);
  input.title = 'Changed';
  input.meta.notes = 'Changed';
  expect(await pending).toMatchObject({ title: 'Original', meta: { notes: 'Original' } });
});
