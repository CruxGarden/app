import { beforeEach, describe, expect, it } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from '../index';
import { defaultGrowthDeps, growthHostFor, removeLatestSnapshotCore } from '../growth';
import { createTask, prepareTaskReview } from '../tasks';
import { findWorkingCopy } from '../working-copies';
import { allWorkspaces, closeWorkspace } from '@/stores/workspaceRegistry';

const native = localApiFixture();
beforeEach(() => initServices());
const write = (id: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path: 'work.txt' } });
const link = (sourceId: string, targetId: string, type: 'garden' | 'graft' | 'gate' | 'growth') =>
  getServices().dimension.create({ sourceId, targetId, type });
async function read(id: string) {
  const [file] = await getServices().artifact.findByResource('crux', id);
  return getServices().artifact.readContent(file!);
}
async function snapshot(owner: string, content = 'history') {
  await write(owner, content);
  return (
    await (await growthHostFor(owner)).snapshot({ label: 'Checkpoint', requestedBy: 'person' })
  ).id;
}
async function closeWorkspaces() {
  for (const workspace of allWorkspaces())
    await closeWorkspace(workspace.id, { stop: true, documents: 'discard' });
}
const main = (title: string) => getServices().crux.create({ title, type: 'workspace' });

// Setup uses normal native commands. faultSql injects only deliberate cross-owner
// references or actual storage faults, never obsolete Task rows/Artifact records.
describe('native Crux deletion ownership', () => {
  it('purges a Garden’s history and Store without deleting members or related creations', async () => {
    const { crux, dimension, store } = getServices();
    const a = await crux.create({ title: 'Garden A', kind: 'garden' });
    const b = await crux.create({ title: 'Garden B', kind: 'garden' });
    const own = await snapshot(a.id);
    const member = await main('Member A');
    await write(member.id, 'Member remains');
    await link(a.id, member.id, 'garden');
    const survivors = [];
    for (const type of ['graft', 'gate', 'growth'] as const) {
      const related = await main(`Related ${type}`);
      await write(related.id, type);
      await link(a.id, related.id, type);
      const membership = await link(b.id, related.id, 'garden');
      survivors.push({ related, membership, type });
    }
    await store.set(a.id, 'private', 'remove');
    await store.set(b.id, 'private', 'keep');
    await crux.trash(a.id);
    await crux.restore(a.id);
    expect((await crux.findById(a.id)).deleted).toBeNull();
    await crux.trash(a.id);
    await native().faultSql('UPDATE cruxes SET deleted = ? WHERE id = ?', [
      '2000-01-01T00:00:00.000Z',
      a.id,
    ]);
    expect(await crux.purgeTrash(0)).toBe(1);
    await native().restart();
    expect(await read(member.id)).toBe('Member remains');
    for (const { related, membership, type } of survivors) {
      expect(await read(related.id)).toBe(type);
      expect((await dimension.findById(membership.id)).sourceId).toBe(b.id);
    }
    await expect(crux.findById(own)).rejects.toThrow('not found');
    expect(
      await native().client.get('SELECT crux_id FROM file_content_heads WHERE crux_id = ?', [own]),
    ).toBeUndefined();
    expect(await store.list(a.id)).toEqual([]);
    expect(await store.get(b.id, 'private')).toBe('keep');
    expect(await dimension.findBySourceAndType(a.id)).toEqual([]);
  });

  it('retains shared and foreign-owned history and the shared tip’s ancestors after restart', async () => {
    const { crux, dimension } = getServices();
    const a = await main('A');
    const b = await main('B');
    const base = await snapshot(a.id, 'Ancestor');
    const shared = await snapshot(a.id, 'Shared tip');
    const foreign = await snapshot(b.id, 'Foreign owned');
    await link(a.id, foreign, 'growth');
    const lateral = await snapshot(b.id, 'Lateral');
    await link(a.id, lateral, 'graft');
    await link(b.id, shared, 'growth');
    await closeWorkspaces();
    await crux.delete(a.id);
    await native().restart();
    expect(await read(base)).toBe('Ancestor');
    expect(await read(shared)).toBe('Shared tip');
    expect(await read(foreign)).toBe('Foreign owned');
    expect(await read(lateral)).toBe('Lateral');
    expect(await dimension.findBySourceAndType(b.id, 'growth')).toHaveLength(3);
  });

  it('retains a foreign Task base and ancestry while purging only the deleted owner’s copies', async () => {
    const { crux, dimension, store } = getServices();
    const a = await main('A');
    const b = await main('B');
    const base = await snapshot(a.id, 'Ancestor');
    const pinned = await snapshot(a.id, 'Pinned history');
    await write(b.id, 'Foreign Task bytes');
    const external = await createTask(b.id, 'Foreign Task');
    const externalState = structuredClone(external.baseState);
    externalState.workspace.parentId = pinned;
    // Retain the actual root and current-format fields; inject only the foreign pointer.
    await native().faultSql('UPDATE working_copies SET base_state = ? WHERE id = ?', [
      JSON.stringify(externalState),
      external.id,
    ]);
    const localBase = await snapshot(a.id, 'Local history');
    const copy = await createTask(a.id, 'Local Task');
    const copySnapshot = await snapshot(copy.id, 'Task checkpoint');
    const unrelated = await main('Linked output');
    await write(unrelated.id, 'Keep output');
    await link(copy.id, unrelated.id, 'graft');
    await store.set(copy.id, 'state', 'remove');
    const current = (await findWorkingCopy(copy.id))!;
    await native().client.setWorkingCopyArchived!(copy.id, true, current.revision);
    await closeWorkspaces();
    await crux.delete(a.id);
    await native().restart();
    expect(await read(base)).toBe('Ancestor');
    expect(await read(pinned)).toBe('Pinned history');
    expect((await findWorkingCopy(external.id))!.baseState).toEqual(externalState);
    expect(await read(external.id)).toBe('Foreign Task bytes');
    expect(await findWorkingCopy(copy.id)).toBeNull();
    for (const id of [localBase, copySnapshot]) {
      await expect(crux.findById(id)).rejects.toThrow('not found');
      expect(
        await native().client.get('SELECT crux_id FROM file_content_heads WHERE crux_id = ?', [id]),
      ).toBeUndefined();
    }
    expect(
      await native().client.get('SELECT crux_id FROM file_content_heads WHERE crux_id = ?', [
        copy.id,
      ]),
    ).toBeUndefined();
    expect(await store.list(copy.id)).toEqual([]);
    expect(await read(unrelated.id)).toBe('Keep output');
    expect(await dimension.findBySourceAndType(copy.id)).toEqual([]);
  });

  it('refuses removing a shared history tip before changing files or links', async () => {
    const { crux, dimension } = getServices();
    const a = await main('A');
    const b = await main('B');
    const shared = await snapshot(a.id);
    await link(b.id, shared, 'growth');
    const head = await native().client.fileContent!.head(shared);
    await expect(
      removeLatestSnapshotCore(
        {
          crux: await crux.findById(a.id),
          growths: await dimension.findBySourceAndType(a.id, 'growth'),
        },
        await defaultGrowthDeps(),
      ),
    ).rejects.toThrow(/referenced|shared/);
    expect(await native().client.fileContent!.head(shared)).toEqual(head);
    expect(await read(shared)).toBe('history');
    expect(await dimension.findBySourceAndType(a.id, 'growth')).toHaveLength(1);
    expect(await dimension.findBySourceAndType(b.id, 'growth')).toHaveLength(1);
  });

  it.each(['sourceState', 'targetState', 'resultState', 'candidateBase'] as const)(
    'retains ancestry referenced by a surviving merge’s %s through restart',
    async (field) => {
      const { crux } = getServices();
      const a = await main('A');
      const b = await main('B');
      const base = await snapshot(a.id, 'Ancestor');
      const tip = await snapshot(a.id, 'Retained tip');
      await write(b.id, 'Main B');
      const copy = await createTask(b.id, 'Surviving Task');
      await write(copy.id, 'Reviewed result');
      const review = await prepareTaskReview(copy.id);
      const row = await native().client.get<{ data: string }>(
        'SELECT data FROM task_merges WHERE id = ?',
        [review.id],
      );
      const data = JSON.parse(row!.data);
      if (field === 'candidateBase') {
        const candidate = (await findWorkingCopy(review.candidateId))!;
        candidate.baseState.workspace.parentId = tip;
        await native().faultSql('UPDATE working_copies SET base_state = ? WHERE id = ?', [
          JSON.stringify(candidate.baseState),
          candidate.id,
        ]);
      } else
        data[field] = {
          ...(data[field] ?? data.sourceState),
          workspace: { ...(data[field] ?? data.sourceState).workspace, parentId: tip },
        };
      // The native API created the review/candidate. Inject only a retaining pointer.
      await native().faultSql('UPDATE task_merges SET data = ? WHERE id = ?', [
        JSON.stringify(data),
        review.id,
      ]);
      await closeWorkspaces();
      await crux.delete(a.id);
      await native().restart();
      expect(await read(tip)).toBe('Retained tip');
      expect(await read(base)).toBe('Ancestor');
      expect(await read(copy.id)).toBe('Reviewed result');
      expect(await read(review.candidateId)).toBe('Reviewed result');
    },
  );
  it.each(['starting state', 'merge state'] as const)(
    'protects same-owner history and immutable files pinned by a %s',
    async (reference) => {
      const { crux, artifact } = getServices();
      const a = await main('Merge owner');
      const pinned = await snapshot(a.id);
      const copy = await createTask(a.id, 'Task');
      if (reference === 'merge state') await prepareTaskReview(copy.id);
      const [file] = await artifact.findByResource('crux', pinned);
      const before = await native().client.export();
      await expect(artifact.delete(file!)).rejects.toThrow(/read-only/);
      await expect(crux.delete(pinned)).rejects.toThrow(/task|merge|recovery/);
      expect(await native().client.export()).toEqual(before);
      await native().restart();
      expect(await read(pinned)).toBe('history');
    },
  );
  it('rolls back an owner purge refusal, preserves bytes after restart, and permits retry', async () => {
    const { crux, store } = getServices();
    const a = await main('Atomic deletion');
    const history = await snapshot(a.id);
    await write(a.id, 'Current work');
    await store.set(a.id, 'keep', { count: 3 });
    await closeWorkspaces();
    await native().faultSql(
      "CREATE TRIGGER refuse_purge BEFORE DELETE ON cruxes BEGIN SELECT RAISE(ABORT, 'Purge refused'); END",
    );
    await expect(crux.delete(a.id)).rejects.toThrow('Purge refused');
    await native().restart();
    expect(await read(a.id)).toBe('Current work');
    expect(await read(history)).toBe('history');
    expect(await store.get(a.id, 'keep')).toEqual({ count: 3 });
    await native().faultSql('DROP TRIGGER refuse_purge');
    await crux.delete(a.id);
    await native().restart();
    await expect(crux.findById(a.id)).rejects.toThrow('not found');
    expect(
      await native().client.get('SELECT crux_id FROM file_content_heads WHERE crux_id = ?', [
        history,
      ]),
    ).toBeUndefined();
    expect(await store.list(a.id)).toEqual([]);
  });
});
