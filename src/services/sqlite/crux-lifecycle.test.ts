import { useGardenStore } from '@/stores/gardenStore';
import { openWorkspace, closeWorkspace, getWorkspace } from '@/stores/workspaceRegistry';
import { getServices, initServices } from '../index';
import { expect, it, vi } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { SqliteCruxService } from './crux.service';

const native = localApiFixture();
const service = new SqliteCruxService();

it('propagates an actual purge refusal, retains the row across restart and permits retry', async () => {
  const crux = await service.create({ title: 'Keep after refusal' });
  await native().faultSql(
    "CREATE TRIGGER refuse_purge BEFORE DELETE ON cruxes BEGIN SELECT RAISE(ABORT, 'No purge'); END",
  );
  const run = vi.spyOn(native().client, 'run');
  await expect(service.delete(crux.id)).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
  await native().restart();
  expect((await service.findById(crux.id)).title).toBe('Keep after refusal');
  await native().faultSql('DROP TRIGGER refuse_purge');
  await service.delete(crux.id);
  await expect(service.findById(crux.id)).rejects.toThrow('not found');
});

it('preserves native Trash and restore refusal, then retries across restart', async () => {
  const crux = await service.create({ title: 'Keep alive' });
  await native().faultSql(
    "CREATE TRIGGER refuse_trash BEFORE UPDATE OF deleted ON cruxes BEGIN SELECT RAISE(ABORT, 'No trash'); END",
  );
  const run = vi.spyOn(native().client, 'run');
  await expect(service.trash(crux.id)).rejects.toThrow();
  expect(await service.listAll()).toContainEqual(expect.objectContaining({ id: crux.id }));
  await native().faultSql('DROP TRIGGER refuse_trash');
  await service.trash(crux.id);
  await native().faultSql(
    "CREATE TRIGGER refuse_restore BEFORE UPDATE OF deleted ON cruxes BEGIN SELECT RAISE(ABORT, 'No restore'); END",
  );
  await expect(service.restore(crux.id)).rejects.toThrow();
  await native().restart();
  expect(await service.listTrashed()).toContainEqual(expect.objectContaining({ id: crux.id }));
  await native().faultSql('DROP TRIGGER refuse_restore');
  await service.restore(crux.id);
  expect((await service.findById(crux.id)).deleted).toBeNull();
  expect(run).not.toHaveBeenCalled();
});

it.each(['trash', 'restore', 'delete'] as const)(
  'refuses %s when native lifecycle authority is absent and permits retry',
  async (action) => {
    const crux = await service.create({ title: 'Keep without authority' });
    const db = native().client;
    const command = action === 'delete' ? 'deleteCrux' : 'setCruxTrashed';
    const original = db[command];
    const before = await service.findById(crux.id);
    const run = vi.spyOn(db, 'run');
    delete db[command];
    try {
      await expect(service[action](crux.id)).rejects.toThrow(
        'Crux lifecycle storage is unavailable',
      );
      expect(run).not.toHaveBeenCalled();
      expect(await service.findById(crux.id)).toEqual(before);
    } finally {
      Object.assign(db, { [command]: original });
    }
    await service[action](crux.id);
  },
);

it('purges only expired Trash and preserves recent and living work across restart', async () => {
  const old = await service.create({ title: 'Expired' });
  const recent = await service.create({ title: 'Recent' });
  const living = await service.create({ title: 'Living' });
  await service.trash(old.id);
  await service.trash(recent.id);
  await native().faultSql('UPDATE cruxes SET deleted = ? WHERE id = ?', [
    '2000-01-01T00:00:00.000Z',
    old.id,
  ]);
  expect(await service.purgeTrash(86_400_000)).toBe(1);
  await native().restart();
  await expect(service.findById(old.id)).rejects.toThrow('not found');
  expect(await service.listTrashed()).toContainEqual(expect.objectContaining({ id: recent.id }));
  expect(await service.listAll()).toContainEqual(expect.objectContaining({ id: living.id }));
});

it('requires an open workspace to close before its Crux can be deleted', async () => {
  await initServices();
  const service = getServices();
  const a = await service.crux.create({ title: 'Delete after closing' });
  const b = await service.crux.create({ title: 'Other workspace' });
  const wa = await openWorkspace(a.id);
  const wb = await openWorkspace(b.id);
  await expect(useGardenStore.getState().deleteCrux(wa.id)).rejects.toThrow(
    'Close this Crux workspace',
  );
  expect((await service.crux.findById(wa.id)).id).toBe(wa.id);
  await closeWorkspace(wa.id);
  await useGardenStore.getState().deleteCrux(wa.id);
  expect((await service.crux.listAll()).some((c) => c.id === wa.id)).toBe(false);
  expect(getWorkspace(wb.id)).toBe(wb);
});
