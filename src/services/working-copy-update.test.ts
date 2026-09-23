import { afterEach, expect, it, vi } from 'vitest';
import { getSqliteClient } from './sqlite/client';
import { SqliteCruxService } from './sqlite/crux.service';
import { findWorkingCopy, serializeCopy, updateCopyMeta } from './working-copies';

async function fixture() {
  const service = new SqliteCruxService();
  const main = await service.create({ title: 'Main' });
  const db = getSqliteClient();
  const id = crypto.randomUUID();
  await db.run(
    'INSERT INTO working_copies (id, crux_id, task_id, title, base_snapshot_id, phase, meta, project_folder, revision, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      main.id,
      crypto.randomUUID(),
      'Task',
      crypto.randomUUID(),
      'ready',
      JSON.stringify({ retained: true }),
      '/actual-folder',
      1,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { dispatchEvent });
  return { id, db, service, dispatchEvent };
}
afterEach(() => vi.unstubAllGlobals());

it('captures a Task patch before its renderer queue and notifies only after the owned command commits', async () => {
  const { id, db, service, dispatchEvent } = await fixture();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const blocker = serializeCopy(id, () => wait);
  const update = vi.fn(async (copyId: string, patch: Record<string, unknown>, title?: string) => {
    expect(dispatchEvent).not.toHaveBeenCalled();
    await db.run(
      'UPDATE working_copies SET title = ?, meta = ?, revision = revision + 1 WHERE id = ?',
      [title, JSON.stringify({ retained: true, concurrent: true, ...patch }), copyId],
    );
  });
  db.updateWorkingCopyMeta = update;
  const patch = { nested: { captured: true } };
  const pending = updateCopyMeta(id, patch, 'Renamed');
  patch.nested.captured = false;
  expect(update).not.toHaveBeenCalled();
  release();
  await blocker;
  const result = await pending;
  expect(update).toHaveBeenCalledExactlyOnceWith(id, { nested: { captured: true } }, 'Renamed');
  expect(dispatchEvent).toHaveBeenCalledOnce();
  expect(result.meta).toMatchObject({
    retained: true,
    concurrent: true,
    nested: { captured: true },
    projectFolder: '/actual-folder',
  });
  expect(result.title).toBe('Main · Renamed');
  dispatchEvent.mockClear();
  await service.update(id, { title: 'Via shared service', meta: { notes: 'Agent' } });
  expect(update).toHaveBeenLastCalledWith(id, { notes: 'Agent' }, 'Via shared service');
});

it('refuses failed owned Task updates without a SQL fallback or success notification and permits retry', async () => {
  const { id, db, dispatchEvent } = await fixture();
  const before = await findWorkingCopy(id);
  db.updateWorkingCopyMeta = vi.fn().mockRejectedValue(new Error('Owner is replacing'));
  await expect(updateCopyMeta(id, { bad: true }, 'Failed')).rejects.toThrow('replacing');
  expect(await findWorkingCopy(id)).toEqual(before);
  expect(dispatchEvent).not.toHaveBeenCalled();
  db.updateWorkingCopyMeta = vi.fn().mockResolvedValue(undefined);
  await updateCopyMeta(id, { retried: true });
  expect(dispatchEvent).toHaveBeenCalledOnce();
});

it('preserves legacy revision, reserved-field and title behavior without an owning capability', async () => {
  const { id, db, dispatchEvent } = await fixture();
  expect(db.updateWorkingCopyMeta).toBeUndefined();
  await updateCopyMeta(id, { notes: 'Kept', projectFolder: '/wrong', workingCopy: {} }, '  ');
  expect(await findWorkingCopy(id)).toMatchObject({
    title: 'Untitled task',
    revision: 2,
    projectFolder: '/actual-folder',
    meta: { retained: true, notes: 'Kept' },
  });
  expect((await findWorkingCopy(id))!.meta).not.toHaveProperty('workingCopy');
  expect((await findWorkingCopy(id))!.meta).not.toHaveProperty('projectFolder');
  expect(dispatchEvent).toHaveBeenCalledOnce();
});
