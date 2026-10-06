import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getSqliteClient } from './sqlite/client';
import { initServices, getServices } from './index';
import { createTask } from './tasks';
import { localApiFixture } from '@/test/local-api-fixture';
import { findWorkingCopy, serializeCopy, updateCopyMeta } from './working-copies';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const native = localApiFixture();
beforeEach(() => initServices());
async function fixture() {
  const service = getServices().crux;
  const main = await service.create({ title: 'Main' });
  const copy = await createTask(main.id, 'Task');
  const db = getSqliteClient();
  await db.updateWorkingCopyMeta!(copy.id, { retained: true });
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { dispatchEvent });
  return { id: copy.id, db, service, dispatchEvent, folder: copy.projectFolder };
}

it('captures a Task patch before its renderer queue and notifies only after the owned command commits', async () => {
  const { id, db, service, dispatchEvent, folder } = await fixture();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const blocker = serializeCopy(id, () => wait);
  const ownedUpdate = db.updateWorkingCopyMeta!;
  const update = vi
    .spyOn(db, 'updateWorkingCopyMeta')
    .mockImplementation(async (copyId, patch, title) => {
      expect(dispatchEvent).not.toHaveBeenCalled();
      await ownedUpdate(copyId, patch, title);
    });
  const patch = { nested: { captured: true } };
  const pending = updateCopyMeta(id, patch, 'Renamed');
  patch.nested.captured = false;
  expect(update).not.toHaveBeenCalled();
  await ownedUpdate(id, { concurrent: true });
  release();
  await blocker;
  const result = await pending;
  expect(update).toHaveBeenCalledExactlyOnceWith(id, { nested: { captured: true } }, 'Renamed');
  expect(dispatchEvent).toHaveBeenCalledOnce();
  expect(result.meta).toMatchObject({
    retained: true,
    concurrent: true,
    nested: { captured: true },
    projectFolder: folder,
  });
  expect(result.title).toBe('Main · Renamed');
  dispatchEvent.mockClear();
  await service.update(id, { title: 'Via shared service', meta: { notes: 'Agent' } });
  expect(update).toHaveBeenLastCalledWith(id, { notes: 'Agent' }, 'Via shared service');
});

it('refuses failed owned Task updates without a SQL fallback or success notification and permits retry', async () => {
  const { id, dispatchEvent } = await fixture();
  const before = await findWorkingCopy(id);
  await native().faultSql(
    "CREATE TRIGGER refuse_task_update BEFORE UPDATE ON working_copies BEGIN SELECT RAISE(ABORT, 'Owner is replacing'); END",
  );
  await expect(updateCopyMeta(id, { bad: true }, 'Failed')).rejects.toThrow('replacing');
  expect(await findWorkingCopy(id)).toEqual(before);
  expect(dispatchEvent).not.toHaveBeenCalled();
  await native().faultSql('DROP TRIGGER refuse_task_update');
  await updateCopyMeta(id, { retried: true });
  expect(dispatchEvent).toHaveBeenCalledOnce();
});

it('preserves native revision, reserved-field and title behavior after restart', async () => {
  const { id, dispatchEvent, folder } = await fixture();
  const before = (await findWorkingCopy(id))!;
  await updateCopyMeta(id, { notes: 'Kept', projectFolder: '/wrong', workingCopy: {} }, '  ');
  await native().restart();
  expect(await findWorkingCopy(id)).toMatchObject({
    title: 'Untitled task',
    revision: before.revision + 1,
    projectFolder: folder,
    meta: { retained: true, notes: 'Kept' },
  });
  expect((await findWorkingCopy(id))!.meta).not.toHaveProperty('workingCopy');
  expect((await findWorkingCopy(id))!.meta).not.toHaveProperty('projectFolder');
  expect(dispatchEvent).toHaveBeenCalledOnce();
});
