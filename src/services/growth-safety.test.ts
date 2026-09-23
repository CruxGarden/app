import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initServices, getServices } from './index';
import { getSqliteClient } from './sqlite/client';
import { defaultGrowthHostDeps, headlessGrowthHost } from './growth';

beforeEach(() => initServices('local'));
afterEach(() => vi.restoreAllMocks());

async function scenario() {
  const { crux, artifact } = getServices();
  const main = await crux.create({ title: 'Keep current work', type: 'workspace' });
  const write = (text: string) =>
    artifact.create({ resourceId: main.id, content: text, meta: { path: 'notes.txt' } });
  const read = async (id: string) => {
    const [file] = await artifact.findByResource('crux', id);
    return artifact.readContent(file!.id);
  };
  await write('Earlier version');
  const host = headlessGrowthHost(main.id, await defaultGrowthHostDeps());
  const first = await host.snapshot({ label: 'Earlier', requestedBy: 'person' });
  await write('Current work must survive');
  await crux.update(main.id, {
    meta: { messages: [{ role: 'user', content: 'Current conversation' }] },
  });
  return { main, first, host, read };
}

it.each(['restore', 'branch'] as const)(
  'an agent %s refuses a failed safety snapshot, preserves current work, and can retry',
  async (action) => {
    const { main, first, host, read } = await scenario();
    const db = getSqliteClient();
    const before = await getServices().crux.findById(main.id);
    await db.run(
      "CREATE TRIGGER refuse_safety BEFORE INSERT ON cruxes WHEN NEW.kind = 'snapshot' BEGIN SELECT RAISE(ABORT, 'Safety snapshot refused'); END",
    );
    const restore = () =>
      action === 'restore'
        ? host.restore(first.id, { requestedBy: 'agent:test' })
        : host.branch(first.id, 'New direction', { requestedBy: 'agent:test' });
    await expect(restore()).rejects.toThrow('Could not save a safety snapshot');
    expect(await read(main.id)).toBe('Current work must survive');
    expect((await getServices().crux.findById(main.id)).meta).toEqual(before.meta);
    expect(await host.list()).toHaveLength(1);
    await db.run('DROP TRIGGER refuse_safety');
    const result = await restore();
    expect(await read(main.id)).toBe('Earlier version');
    expect(result.safety?.label).toBe(action === 'restore' ? 'Before revert' : 'Before branch');
    expect(await read(result.safety!.id)).toBe('Current work must survive');
    expect((await getServices().crux.findById(result.safety!.id)).meta?.messages).toEqual(
      before.meta?.messages,
    );
  },
);

it.each(['restore', 'branch'] as const)(
  'the workspace %s refuses a failed safety snapshot without changing the selected history or current work',
  async (action) => {
    const { createCruxStore } = await import('@/stores/cruxStore');
    const { createUIStore } = await import('@/stores/uiStore');
    const { main, first, read } = await scenario();
    const store = createCruxStore(createUIStore());
    await store.getState().loadCrux(main.id);
    await store.getState().viewSnapshot(first.id, 0);
    const messages = store.getState().messages;
    const db = getSqliteClient();
    await db.run(
      "CREATE TRIGGER refuse_safety BEFORE INSERT ON cruxes WHEN NEW.kind = 'snapshot' BEGIN SELECT RAISE(ABORT, 'Safety snapshot refused'); END",
    );
    const restore = () =>
      action === 'restore'
        ? store.getState().revertToSnapshot(first.id)
        : store.getState().branchFromSnapshot(first.id, 'New direction');
    await expect(restore()).rejects.toThrow('Could not save a safety snapshot');
    expect(await read(main.id)).toBe('Current work must survive');
    expect(store.getState().viewingSnapshotId).toBe(first.id);
    expect(store.getState().messages).toEqual(messages);
    expect(store.getState().growths).toHaveLength(1);
    await db.run('DROP TRIGGER refuse_safety');
    await restore();
    expect(await read(main.id)).toBe('Earlier version');
    expect(store.getState().viewingSnapshotId).toBeNull();
    const safety = store
      .getState()
      .growths.find(
        (g) => g.meta?.label === (action === 'restore' ? 'Before revert' : 'Before branch'),
      )!;
    expect(await read(safety.targetId)).toBe('Current work must survive');
  },
);
