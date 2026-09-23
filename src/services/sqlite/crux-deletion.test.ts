import { describe, expect, it } from 'vitest';
import { SqliteCruxService } from './crux.service';
import { SqliteArtifactService } from './artifact.service';
import { SqliteDimensionService } from './dimension.service';
import { SqliteStoreService } from './store.service';
import { getSqliteClient } from './client';
import { removeLatestSnapshotCore, type GrowthDeps } from '../growth';
import type { DimensionType } from '../types';

const crux = new SqliteCruxService();
const artifact = new SqliteArtifactService();
const dimension = new SqliteDimensionService();
const store = new SqliteStoreService();
const write = (id: string, content: string) =>
  artifact.create({ resourceId: id, content, meta: { path: 'work.txt' } });
const link = (sourceId: string, targetId: string, type: DimensionType) =>
  dimension.create({ sourceId, targetId, type });

async function snapshot(owner: string, meta: Record<string, unknown> = {}) {
  const value = await crux.create({ title: 'Checkpoint', kind: 'snapshot', meta });
  await link(owner, value.id, 'growth');
  const file = await write(value.id, 'history');
  return { value, file };
}

async function task(owner: string, base: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getSqliteClient().run(
    `INSERT INTO working_copies
      (id, crux_id, task_id, title, base_snapshot_id, phase, created, updated)
      VALUES (?, ?, ?, 'Task', ?, 'ready', ?, ?)`,
    [id, owner, crypto.randomUUID(), base, now, now],
  );
  return id;
}

describe('Crux deletion ownership', () => {
  it('purges one Garden without removing shared members or related creations', async () => {
    const a = await crux.create({ title: 'Garden A', kind: 'garden' });
    const b = await crux.create({ title: 'Garden B', kind: 'garden' });
    const own = await snapshot(a.id); // Legacy Main snapshots have no contentOwnerId.
    const survivors = [];
    for (const type of ['garden', 'graft', 'gate', 'growth'] as const) {
      const member = await crux.create({ title: `Related ${type}` });
      const file = await write(member.id, type);
      await link(a.id, member.id, type);
      const membership = await link(b.id, member.id, 'garden');
      survivors.push({ member, file, membership, type });
    }
    await store.set(a.id, 'private', 'remove');
    await store.set(b.id, 'private', 'keep');
    await crux.trash(a.id);
    await crux.restore(a.id);
    await crux.trash(a.id);
    await getSqliteClient().run('UPDATE cruxes SET deleted = ? WHERE id = ?', [
      '2000-01-01T00:00:00.000Z',
      a.id,
    ]);
    expect(await crux.purgeTrash(0)).toBe(1);
    for (const { member, file, membership, type } of survivors) {
      expect((await crux.findById(member.id)).id).toBe(member.id);
      expect(await artifact.readContent(file.id)).toBe(type);
      expect((await dimension.findById(membership.id)).sourceId).toBe(b.id);
    }
    await expect(crux.findById(own.value.id)).rejects.toThrow('not found');
    expect(await artifact.findByResource('crux', own.value.id)).toEqual([]);
    expect(await store.list(a.id)).toEqual([]);
    expect(await store.get(b.id, 'private')).toBe('keep');
    expect(
      await getSqliteClient().all('SELECT * FROM dimensions WHERE target_id = ?', [own.value.id]),
    ).toEqual([]);
  });

  it('keeps snapshots owned or referenced by surviving Cruxes, including their ancestors', async () => {
    const a = await crux.create({ title: 'A' });
    const b = await crux.create({ title: 'B' });
    const base = await snapshot(a.id);
    const shared = await snapshot(a.id, { parentCruxId: base.value.id });
    await link(b.id, shared.value.id, 'growth');
    const foreign = await snapshot(a.id, { contentOwnerId: b.id });
    const grafted = await crux.create({ title: 'History reference', kind: 'snapshot' });
    const graftedFile = await write(grafted.id, 'lateral');
    await link(a.id, grafted.id, 'graft');
    await crux.delete(a.id);
    for (const { value, file } of [base, shared, foreign]) {
      expect((await crux.findById(value.id)).id).toBe(value.id);
      expect(await artifact.readContent(file.id)).toBe('history');
    }
    expect(await artifact.readContent(graftedFile.id)).toBe('lateral');
    expect(await dimension.findBySourceAndType(b.id, 'growth')).toHaveLength(1);
  });

  it('retains an external Task base and ancestry but cleans up the deleted owner’s Tasks', async () => {
    const a = await crux.create({ title: 'A' });
    const b = await crux.create({ title: 'B' });
    const base = await snapshot(a.id);
    const pinned = await snapshot(a.id, { parentCruxId: base.value.id });
    const external = await task(b.id, pinned.value.id);
    const localBase = await snapshot(a.id);
    const copy = await task(a.id, localBase.value.id);
    const copyFile = await write(copy, 'task');
    const copySnapshot = await snapshot(copy, { contentOwnerId: copy });
    const unrelated = await crux.create({ title: 'Linked task output' });
    const unrelatedFile = await write(unrelated.id, 'keep');
    await link(copy, unrelated.id, 'garden');
    await store.set(copy, 'state', 'remove');
    await getSqliteClient().run("UPDATE working_copies SET phase = 'archived' WHERE id = ?", [
      copy,
    ]);
    await crux.delete(a.id);
    for (const saved of [base, pinned])
      expect(await artifact.readContent(saved.file.id)).toBe('history');
    expect(
      await getSqliteClient().get('SELECT id FROM working_copies WHERE id = ?', [external]),
    ).toBeTruthy();
    expect(
      await getSqliteClient().get('SELECT id FROM working_copies WHERE id = ?', [copy]),
    ).toBeUndefined();
    await expect(artifact.findById(copyFile.id)).rejects.toThrow('not found');
    for (const saved of [localBase, copySnapshot])
      await expect(crux.findById(saved.value.id)).rejects.toThrow('not found');
    expect(await store.list(copy)).toEqual([]);
    expect(await artifact.readContent(unrelatedFile.id)).toBe('keep');
    expect((await crux.findById(unrelated.id)).id).toBe(unrelated.id);
    expect(await dimension.findBySourceAndType(copy)).toEqual([]);
  });

  it('refuses removing a shared history tip before deleting its file records', async () => {
    const a = await crux.create({ title: 'A' });
    const b = await crux.create({ title: 'B' });
    const shared = await snapshot(a.id);
    await link(b.id, shared.value.id, 'growth');
    const deps: GrowthDeps = {
      crux: {
        create: async () => {
          throw new Error('Not used');
        },
        findById: (id) => crux.findById(id),
        update: async () => undefined,
        delete: (id) => crux.delete(id),
      },
      artifact,
      dimension: {
        create: async () => {
          throw new Error('Not used');
        },
        update: async () => undefined,
      },
    };
    await expect(
      removeLatestSnapshotCore(
        {
          crux: a,
          growths: await dimension.findBySourceAndType(a.id, 'growth'),
        },
        deps,
      ),
    ).rejects.toThrow(/referenced|shared/);
    expect(await artifact.readContent(shared.file.id)).toBe('history');
    expect(await dimension.findBySourceAndType(a.id, 'growth')).toHaveLength(1);
    expect(await dimension.findBySourceAndType(b.id, 'growth')).toHaveLength(1);
  });

  it.each(['baseId', 'sourceHead', 'targetHead', 'resultHead'])(
    'retains history referenced by a surviving merge’s %s',
    async (field) => {
      const a = await crux.create({ title: 'A' });
      const b = await crux.create({ title: 'B' });
      const base = await snapshot(a.id);
      const tip = await snapshot(a.id, { parentCruxId: base.value.id });
      const candidate = await snapshot(b.id);
      await getSqliteClient().run(
        `INSERT INTO task_merges (id, crux_id, copy_id, candidate_id, phase, data, created)
         VALUES (?, ?, ?, ?, 'applying', ?, ?)`,
        [
          crypto.randomUUID(),
          b.id,
          crypto.randomUUID(),
          candidate.value.id,
          JSON.stringify({ [field]: tip.value.id }),
          new Date().toISOString(),
        ],
      );
      await crux.delete(a.id);
      expect(await artifact.readContent(tip.file.id)).toBe('history');
      expect(await artifact.readContent(base.file.id)).toBe('history');
    },
  );
  it.each(['candidate_id', 'baseId'])(
    'protects a same-owner merge %s before any snapshot files are removed',
    async (field) => {
      const a = await crux.create({ title: 'Merge owner' });
      const pinned = await snapshot(a.id);
      await getSqliteClient().run(
        'INSERT INTO task_merges (id, crux_id, copy_id, candidate_id, phase, data, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          crypto.randomUUID(),
          a.id,
          crypto.randomUUID(),
          field === 'candidate_id' ? pinned.value.id : crypto.randomUUID(),
          'applying',
          JSON.stringify(field === 'baseId' ? { baseId: pinned.value.id } : {}),
          new Date().toISOString(),
        ],
      );
      await expect(artifact.delete(pinned.file.id)).rejects.toThrow(/task|merge/);
      await expect(crux.delete(pinned.value.id)).rejects.toThrow(/task|merge/);
      expect(await artifact.readContent(pinned.file.id)).toBe('history');
    },
  );
});
