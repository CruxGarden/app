import { useGardenContext } from '@/stores/gardenContext';
import { createLocalApiTestClient } from '@/test/local-api-client';
import { setSqliteClient } from './sqlite/client';
import * as editHistory from './edit-history';
import { exportGarden, importGarden } from './garden-io';
import { cruxUpsertFields, publishPipeline, unpublishPipeline } from './publish';
import { exportCrux, importCrux } from './crux-io';
import JSZip from 'jszip';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { getServices, initServices } from './index';
import {
  createTask,
  recoverTaskSetup,
  prepareTaskReview,
  verifyTaskReview,
  applyTaskReview,
  resumeTaskMerge,
  archiveTask,
  resolveTaskReview,
  releaseTaskReview,
} from './tasks';
import { findWorkingCopy } from './working-copies';
import {
  allWorkspaces,
  closeWorkspace,
  closeCruxWorkspaces,
  shutdownWorkspaces,
  restoreWorkspaceList,
  openWorkspace,
  useWorkspaceRegistry,
} from '@/stores/workspaceRegistry';
import { getSqliteClient } from './sqlite/client';

let native: Awaited<ReturnType<typeof createLocalApiTestClient>>;
beforeEach(async () => {
  native = await createLocalApiTestClient();
  setSqliteClient(native.client);
  useGardenContext.getState().initialize(await native.client.enterLocalGarden!());
  await initServices();
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents: 'discard' });
  useWorkspaceRegistry.setState({ entries: [], mru: [], activeId: null, restored: false });
  await native.client.close();
});
const write = (id: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path: 'index.html' } });
async function read(id: string) {
  const a = (await getServices().artifact.findByResource('crux', id)).find(
    (a) => a.meta?.path === 'index.html',
  )!;
  return getServices().artifact.readContent(a);
}
async function fixture() {
  const main = await getServices().crux.create({ title: 'Parallel project' });
  await write(main.id, '<h1>Base</h1>');
  await getServices().store.set(main.id, 'count', 2);
  await (await openWorkspace(main.id)).data
    .getState()
    .createSnapshot({ label: 'Starting Main', silent: true });
  const a = await createTask(main.id, 'Task A');
  const b = await createTask(main.id, 'Task B');
  return { main, a, b };
}
describe('parallel tasks', () => {
  it('refuses an incomplete native Task owner before creating a workspace, Growth or copy', async () => {
    const main = await getServices().crux.create({ title: 'Unopened Main' });
    await write(main.id, 'Keep Main');
    const before = await native.client.export();
    const command = native.client.finishWorkingCopySetup;
    native.client.finishWorkingCopySetup = undefined;
    try {
      await expect(createTask(main.id, 'Cannot prepare')).rejects.toThrow(
        'Task storage is unavailable',
      );
      expect(allWorkspaces()).toEqual([]);
      expect(await native.client.all('SELECT id FROM working_copies')).toEqual([]);
      expect(await native.client.export()).toEqual(before);
    } finally {
      native.client.finishWorkingCopySetup = command;
    }
    const task = await createTask(main.id, 'Can prepare');
    expect(task.phase).toBe('ready');
    expect(await read(task.id)).toBe('Keep Main');
  });
  it('refuses missing merge authority before changing a checked review or releasing its candidate', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Checked result');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const before = await native.client.export();
    const begin = native.client.beginTaskMerge;
    native.client.beginTaskMerge = undefined;
    try {
      await expect(applyTaskReview(review.id)).rejects.toThrow('Task storage is unavailable');
      await expect(releaseTaskReview(review.id)).rejects.toThrow('Task storage is unavailable');
      expect(await native.client.export()).toEqual(before);
      expect(await read(main.id)).toBe('<h1>Base</h1>');
      expect(await read(review.candidateId)).toBe('Checked result');
    } finally {
      native.client.beginTaskMerge = begin;
    }
    await applyTaskReview(review.id);
    expect(await read(main.id)).toBe('Checked result');
  });
  it('checks a content-only task on an embedded app without rebuilding its editor', async () => {
    const { artifact, crux } = getServices();
    const main = await crux.create({
      title: 'Board',
      kind: 'webapp',
      type: 'workspace',
      meta: { template: 'kan-app', settings: { entryFile: 'runtime/index.html' } },
    });
    await artifact.create({
      resourceId: main.id,
      content: JSON.stringify({ name: 'kan', scripts: { build: 'exit 1' } }),
      meta: { path: 'package.json' },
    });
    await artifact.create({
      resourceId: main.id,
      content: JSON.stringify({ version: 1, app: 'kan', project: null }),
      meta: { path: 'data/project.json' },
    });
    const task = await createTask(main.id, 'Plan the room');
    await artifact.create({
      resourceId: task.id,
      content: JSON.stringify({ version: 1, app: 'kan', project: { state: { version: 1 } } }),
      meta: { path: 'data/project.json' },
    });
    const review = await prepareTaskReview(task.id);
    const verified = await verifyTaskReview(review.id);
    expect(verified.verificationLog).toContain('prebuilt runtime stands');
    expect(verified.verifiedKey).toBeTruthy();
    // A source change still asks for the real build, which this environment cannot run.
    const source = await createTask(main.id, 'Change the editor');
    await artifact.create({
      resourceId: source.id,
      content: 'export {}',
      meta: { path: 'src/app.ts' },
    });
    const sourceReview = await prepareTaskReview(source.id);
    await expect(verifyTaskReview(sourceReview.id)).rejects.toThrow(/Desktop Mode|build/);
  });

  it('keeps files, Store, sessions and workspace identity independent without making another Crux row', async () => {
    const { main, a, b } = await fixture();
    await write(a.id, 'A');
    await write(b.id, 'B');
    expect(await read(main.id)).toBe('<h1>Base</h1>');
    expect(await read(a.id)).toBe('A');
    expect(await read(b.id)).toBe('B');
    await getServices().store.set(a.id, 'count', 9);
    expect(await getServices().store.get(b.id, 'count')).toBe(2);
    await getServices().crux.update(a.id, { meta: { settings: { agentSessionId: 'only-a' } } });
    expect(
      (await getServices().crux.findById(b.id)).meta?.settings?.agentSessionId,
    ).toBeUndefined();
    const [wa, wb] = await Promise.all([openWorkspace(a.id), openWorkspace(b.id)]);
    expect(wa.cruxId).toBe(main.id);
    expect(wa.lifetimeId).not.toBe(wb.lifetimeId);
    expect(
      await getSqliteClient().get('SELECT id FROM cruxes WHERE id = ?', [a.id]),
    ).toBeUndefined();
  });
  it('merges retained Task state and keeps both captured input versions; repeat apply is idempotent', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Task result');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const result = await applyTaskReview(review.id);
    expect(await read(main.id)).toBe('Task result');
    expect((await findWorkingCopy(a.id))?.phase).toBe('merged');
    expect(result.sourceState).toEqual(review.sourceState);
    expect(result.targetState).toEqual(review.targetState);
    expect(result.resultState?.root).toBe(
      (await getSqliteClient().fileContent!.head(main.id))!.root,
    );
    expect((await applyTaskReview(review.id)).resultState).toEqual(result.resultState);
    await expect(write(a.id, 'late')).rejects.toThrow('closed for editing');
  });
  it('refuses a stale review before touching Main', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Task result');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    await write(main.id, 'New main edit');
    await expect(applyTaskReview(review.id)).rejects.toThrow('changed after review');
    expect(await read(main.id)).toBe('New main edit');
  });
  it('requires an explicit choice for conflicting replacements and invalidates verification', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'A');
    await write(main.id, 'Main');
    const review = await prepareTaskReview(a.id);
    expect(review.conflicts.map((c) => c.path)).toEqual(['index.html']);
    await expect(verifyTaskReview(review.id)).rejects.toThrow('Resolve the conflicts');
    const resolved = await resolveTaskReview(review.id, { 'index.html': 'task' });
    expect(resolved.conflicts).toHaveLength(0);
    await expect(applyTaskReview(review.id)).rejects.toThrow('Check the resolved');
    await verifyTaskReview(review.id);
    await applyTaskReview(review.id);
    expect(await read(main.id)).toBe('A');
  });
  it('preserves private task files and remaps every history reference when cloned', async () => {
    const { main, a, b } = await fixture();
    await write(a.id, 'Merged A');
    await write(b.id, 'Private B');
    const wa = await openWorkspace(a.id);
    wa.data.getState().addMessage({ role: 'user', content: 'A conversation' });
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    await applyTaskReview(review.id);
    await getServices().crux.update(b.id, {
      meta: {
        settings: {
          agentSessionId: 'do-not-resume',
          agentSessions: { codex: 'do-not-resume-codex' },
        },
      },
    });
    const backup = await exportCrux({ cruxId: main.id });
    expect(backup.failed).toEqual([]);
    const zip = await JSZip.loadAsync(await backup.blob.arrayBuffer());
    expect(JSON.parse(await zip.file('manifest.json')!.async('text')).archiveVersion).toBe(3);
    expect(await zip.file('graph.json')!.async('text')).not.toContain('do-not-resume');
    const clone = await importCrux({ data: backup.blob, mode: 'clone' });
    expect(await read(clone.cruxId)).toBe('Merged A');
    const { listWorkingCopies } = await import('./working-copies');
    const copies = await listWorkingCopies(clone.cruxId);
    expect(copies).toHaveLength(2);
    expect(await read(copies.find((c) => c.title === 'Task B')!.id)).toBe('Private B');
    for (const copy of copies) {
      expect([a.id, b.id]).not.toContain(copy.id);
      expect([a.taskId, b.taskId]).not.toContain(copy.taskId);
      expect(copy.baseState!.workspace.parentId).not.toBe(a.baseState!.workspace.parentId);
      const loaded = await openWorkspace(copy.id);
      expect(loaded.cruxId).toBe(clone.cruxId);
    }
    const row = await getSqliteClient().get<{ data: string }>(
      'SELECT data FROM task_merges WHERE crux_id = ? AND phase = ?',
      [clone.cruxId, 'merged'],
    );
    const remapped = JSON.parse(row!.data);
    expect(remapped.copyId).toBe(copies.find((c) => c.title === 'Task A')!.id);
    expect(remapped.id).not.toBe(review.id);
    expect(remapped.sourceState.workspace.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'A conversation' })]),
    );
    expect(remapped.targetState.workspace.parentId).not.toBe(
      review.targetState!.workspace.parentId,
    );
  });
  it('keeps prepared content recoverable when both setup completion and failure recording are refused', async () => {
    const { main } = await fixture();
    const db = getSqliteClient();
    vi.spyOn(db, 'finishWorkingCopySetup').mockImplementation(async () => {
      throw new Error('Setup result refused');
    });
    await expect(createTask(main.id, 'Unfinished task')).rejects.toThrow('Setup result refused');
    const unfinished = await db.get<{ id: string; phase: string; revision: number }>(
      "SELECT id, phase, revision FROM working_copies WHERE title = 'Unfinished task'",
    );
    expect(unfinished?.phase).toBe('preparing');
    expect(await read(unfinished!.id)).toBe('<h1>Base</h1>');
    expect(db.finishWorkingCopySetup).toHaveBeenCalledWith(
      unfinished!.id,
      unfinished!.revision,
      'ready',
    );
    expect(db.finishWorkingCopySetup).toHaveBeenCalledWith(
      unfinished!.id,
      unfinished!.revision,
      'failed',
    );
    vi.mocked(db.finishWorkingCopySetup!).mockRestore();
    await recoverTaskSetup(unfinished!.id);
    expect((await findWorkingCopy(unfinished!.id))?.phase).toBe('ready');
  });
  it('keeps the original journal when API verification saving fails and retries the check', async () => {
    const { a } = await fixture();
    const review = await prepareTaskReview(a.id);
    const db = getSqliteClient();
    vi.spyOn(db, 'saveTaskReview').mockImplementation(async () => {
      throw new Error('Review save refused');
    });
    await expect(verifyTaskReview(review.id)).rejects.toThrow('Review save refused');
    expect(db.saveTaskReview).toHaveBeenCalledWith(expect.any(String), JSON.stringify(review));
    const row = await db.get<{ data: string }>('SELECT data FROM task_merges WHERE id = ?', [
      review.id,
    ]);
    expect(JSON.parse(row!.data)).toEqual(review);
    expect((await findWorkingCopy(review.candidateId))?.phase).toBe('ready');
    vi.mocked(db.saveTaskReview!).mockRestore();
    expect((await verifyTaskReview(review.id)).verifiedKey).toBeDefined();
  });
  it('does not project files or create merge Growth after API admission refusal', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Checked result');
    const review = await prepareTaskReview(a.id);
    const verified = await verifyTaskReview(review.id);
    const db = getSqliteClient();
    const history = await getServices().dimension.findBySourceAndType(main.id, 'growth');
    vi.spyOn(db, 'beginTaskMerge').mockImplementation(async () => {
      throw new Error('Review admission refused');
    });
    await expect(applyTaskReview(review.id)).rejects.toThrow('Review admission refused');
    expect(db.beginTaskMerge).toHaveBeenCalledWith(review.id, JSON.stringify(verified));
    expect(await read(main.id)).toBe('<h1>Base</h1>');
    expect(await db.get('SELECT phase FROM task_merges WHERE id = ?', [review.id])).toEqual({
      phase: 'review',
    });
    expect(await getServices().dimension.findBySourceAndType(main.id, 'growth')).toEqual(history);
    vi.mocked(db.beginTaskMerge!).mockRestore();
    await applyTaskReview(review.id);
    expect(await read(main.id)).toBe('Checked result');
  });
  it('retains a usable review when the owning API refuses cancellation', async () => {
    const { a } = await fixture();
    const review = await prepareTaskReview(a.id);
    const db = getSqliteClient();
    vi.spyOn(db, 'releaseTaskReview').mockImplementation(async () => {
      throw new Error('Cancel refused');
    });
    await expect(releaseTaskReview(review.id)).rejects.toThrow('Cancel refused');
    expect((await findWorkingCopy(review.candidateId))?.phase).toBe('ready');
    expect(await db.get('SELECT phase FROM task_merges WHERE id = ?', [review.id])).toEqual({
      phase: 'review',
    });
    vi.mocked(db.releaseTaskReview!).mockRestore();
    await releaseTaskReview(review.id);
    expect((await findWorkingCopy(review.candidateId))?.phase).toBe('archived');
    expect((await findWorkingCopy(a.id))?.phase).toBe('ready');
  });
  it('keeps the recovery journal after owned finalization refusal and reuses the captured result', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Owned result');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const db = getSqliteClient();
    vi.spyOn(db, 'completeTaskMerge').mockImplementation(async () => {
      throw new Error('Journal commit refused');
    });
    await expect(applyTaskReview(review.id)).rejects.toThrow('Journal commit refused');
    expect((await findWorkingCopy(a.id))?.phase).toBe('ready');
    expect(await db.get('SELECT phase FROM task_merges WHERE id = ?', [review.id])).toEqual({
      phase: 'applying',
    });
    await expect(write(main.id, 'blocked')).rejects.toThrow('recovering');
    const before = await getServices().dimension.findBySourceAndType(main.id, 'growth');
    expect(db.completeTaskMerge).toHaveBeenCalledWith(review.id);
    vi.mocked(db.completeTaskMerge!).mockRestore();
    await resumeTaskMerge(review.id);
    expect(await read(main.id)).toBe('Owned result');
    expect(await getServices().dimension.findBySourceAndType(main.id, 'growth')).toHaveLength(
      before.length,
    );
  });
  it('rolls back refused merge completion and retry preserves one captured result', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Recovered result');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const before = await getServices().dimension.findBySourceAndType(main.id, 'growth');
    await native.faultSql(
      "CREATE TRIGGER refuse_merge_completion BEFORE UPDATE ON task_merges WHEN NEW.phase = 'merged' BEGIN SELECT RAISE(ABORT, 'Simulated interruption'); END",
    );
    await expect(applyTaskReview(review.id)).rejects.toThrow('Simulated interruption');
    await expect(write(main.id, 'blocked')).rejects.toThrow('recovering');
    expect(await getServices().dimension.findBySourceAndType(main.id, 'growth')).toHaveLength(
      before.length,
    );
    await native.faultSql('DROP TRIGGER refuse_merge_completion');
    await resumeTaskMerge(review.id);
    expect(await read(main.id)).toBe('Recovered result');
    expect(await getServices().dimension.findBySourceAndType(main.id, 'growth')).toHaveLength(
      before.length,
    );
    await applyTaskReview(review.id);
    expect(await getServices().dimension.findBySourceAndType(main.id, 'growth')).toHaveLength(
      before.length,
    );
  });
  it('protects task bases before deleting any snapshot Artifacts', async () => {
    const main = await getServices().crux.create({ title: 'History guard' });
    await write(main.id, 'Base');
    await (await openWorkspace(main.id)).data
      .getState()
      .createSnapshot({ label: 'Protected base', silent: true });
    const a = await createTask(main.id, 'Task');
    const before = await read(a.baseState!.workspace.parentId!);
    await expect(
      (await openWorkspace(main.id)).data.getState().removeLatestSnapshot(),
    ).rejects.toThrow('used by a task');
    expect(await read(a.baseState!.workspace.parentId!)).toBe(before);
  });
  it('recovers setup from its captured base and keeps restored task membership', async () => {
    const { main, a, b } = await fixture();
    await native.faultSql("UPDATE working_copies SET phase = 'preparing' WHERE id = ?", [a.id]);
    await recoverTaskSetup(a.id);
    expect((await findWorkingCopy(a.id))?.phase).toBe('ready');
    expect(await read(a.id)).toBe('<h1>Base</h1>');
    await openWorkspace(b.id);
    await shutdownWorkspaces('save');
    useWorkspaceRegistry.setState({ entries: [], mru: [], activeId: null, restored: false });
    await restoreWorkspaceList();
    expect(useWorkspaceRegistry.getState().entries.map((e) => e.id)).toEqual(
      expect.arrayContaining([main.id, a.id, b.id]),
    );
    await closeCruxWorkspaces(main.id, 'save');
    expect(useWorkspaceRegistry.getState().entries).toHaveLength(0);
    expect(await read(b.id)).toBe('<h1>Base</h1>');
  });
  it('refused Task checkpoint retains bytes and conversation; retry records one Growth', async () => {
    const { a } = await fixture();
    await write(a.id, 'Result');
    const w = await openWorkspace(a.id);
    w.data
      .getState()
      .addMessage({ role: 'user', content: 'Keep this turn', timestamp: new Date().toISOString() });
    const before = await getServices().dimension.findBySourceAndType(a.id, 'growth');
    await native.faultSql(
      "CREATE TRIGGER refuse_task_snapshot BEFORE INSERT ON cruxes WHEN NEW.kind = 'snapshot' BEGIN SELECT RAISE(ABORT, 'Interrupted snapshot'); END",
    );
    await expect(
      w.data.getState().createSnapshot({ label: 'Task result', silent: true }),
    ).rejects.toThrow('Could not create Crux');
    expect(await read(a.id)).toBe('Result');
    expect(w.data.getState().messages.filter((m) => m.content === 'Keep this turn')).toHaveLength(
      1,
    );
    expect(await getServices().dimension.findBySourceAndType(a.id, 'growth')).toHaveLength(
      before.length,
    );
    await native.faultSql('DROP TRIGGER refuse_task_snapshot');
    await w.data.getState().createSnapshot({ label: 'Task result', silent: true });
    expect(await getServices().dimension.findBySourceAndType(a.id, 'growth')).toHaveLength(
      before.length + 1,
    );
  });
  it('retains interrupted projection and recovery journal across an API restart', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Result');
    await getServices().artifact.create({
      resourceId: a.id,
      content: 'Second',
      meta: { path: 'second.txt' },
    });
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const projection = vi
      .spyOn(getSqliteClient().fileContent!, 'finishProjection')
      .mockRejectedValueOnce(new Error('Interrupted projection'));
    await expect(applyTaskReview(review.id)).rejects.toThrow('Interrupted projection');
    await expect(exportCrux({ cruxId: main.id })).rejects.toThrow(
      'Recover the selected Task merge',
    );
    await expect(write(main.id, 'External edit')).rejects.toThrow('recovering');
    projection.mockRestore();
    await native.restart();
    expect(
      await getSqliteClient().get('SELECT phase FROM task_merges WHERE id = ?', [review.id]),
    ).toEqual({ phase: 'applying' });
    await resumeTaskMerge(review.id);
    expect(await read(main.id)).toBe('Result');
    expect(
      (await getServices().artifact.findByResource('crux', main.id)).some(
        (f) => f.meta?.path === 'second.txt',
      ),
    ).toBe(true);
  });
  it('round-trips a whole garden with private task history and fresh provider sessions', async () => {
    const { main, a, b } = await fixture();
    await write(a.id, 'Archived work');
    await archiveTask(a.id, true);
    await write(b.id, 'Unfinished work');
    for (const id of [main.id, b.id]) {
      const w = await openWorkspace(id);
      w.data.getState().patchCruxMeta({ settings: { agentSessionId: 'old-session' } });
      await w.data.getState().saveMeta();
    }
    await closeCruxWorkspaces(main.id, 'save');
    const backup = await exportGarden();
    const zip = await JSZip.loadAsync(await backup.blob.arrayBuffer());
    expect(JSON.parse(await zip.file('manifest.json')!.async('text'))).toMatchObject({
      version: '4.0',
      scope: 'installation',
    });
    await importGarden({ data: backup.blob });
    expect(await read(a.id)).toBe('Archived work');
    expect(await read(b.id)).toBe('Unfinished work');
    expect((await findWorkingCopy(a.id))?.phase).toBe('archived');
    expect(await read(a.baseState!.workspace.parentId!)).toBe('<h1>Base</h1>');
    for (const id of [main.id, b.id])
      expect(
        (await getServices().crux.findById(id)).meta?.settings?.agentSessionId,
      ).toBeUndefined();
  });
  it('publishes only Main and its included task conversation, without runtime metadata', async () => {
    const { main, a, b } = await fixture();
    (await openWorkspace(a.id)).data.getState().addMessage({ role: 'user', content: 'Included A' });
    (await openWorkspace(b.id)).data.getState().addMessage({ role: 'user', content: 'Private B' });
    await write(a.id, 'A');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    await applyTaskReview(review.id);
    const s = (await openWorkspace(main.id)).data.getState();
    const projection = cruxUpsertFields(
      {
        ...s.crux!,
        meta: {
          ...s.crux!.meta,
          projectFolder: '/private/local',
          settings: {
            agentSessionId: 'private-session',
            agentSessions: { codex: 'private-codex-session' },
          },
        },
      },
      s.messages,
    );
    expect(JSON.stringify(projection)).toContain('Included A');
    expect(JSON.stringify(projection)).not.toContain('Private B');
    expect(JSON.stringify(projection)).not.toContain('/private/local');
    expect(JSON.stringify(projection)).not.toContain('private-session');
    expect(JSON.stringify(projection)).not.toContain('private-codex-session');
    const copy = await getServices().crux.findById(b.id);
    await expect(publishPipeline(copy, [])).rejects.toThrow('Main');
    await expect(unpublishPipeline(copy)).rejects.toThrow('Main');
  });
  it('rejects a damaged backup before creating another Crux', async () => {
    const { main } = await fixture();
    const backup = await exportCrux({ cruxId: main.id });
    const zip = await JSZip.loadAsync(await backup.blob.arrayBuffer());
    const file = Object.keys(zip.files).find(
      (p) => p.startsWith('content/') && !zip.files[p]!.dir,
    )!;
    zip.remove(file);
    await expect(
      importCrux({ data: await zip.generateAsync({ type: 'arraybuffer' }), mode: 'clone' }),
    ).rejects.toThrow('Missing private archive content');
    expect((await getServices().crux.listAll()).filter((c) => c.kind !== 'garden')).toHaveLength(1);
  });
  it('restores and branches task history without importing Main conversation or dropping earlier task segments', async () => {
    const main = await getServices().crux.create({ title: 'History scopes' });
    await write(main.id, 'Base');
    const wm = await openWorkspace(main.id);
    wm.data.getState().addMessage({ role: 'user', content: 'Main conversation' });
    const task = await createTask(main.id, 'Separate conversation');
    const w = await openWorkspace(task.id);
    w.data.getState().addMessage({ role: 'user', content: 'First task message' });
    await w.data.getState().createSnapshot({ silent: true });
    w.data.getState().addMessage({ role: 'assistant', content: 'Second task message' });
    await w.data.getState().createSnapshot({ silent: true });
    const tip = w.data.getState().growths.at(-1)!.targetId;
    await w.data.getState().revertToSnapshot(tip);
    expect(w.data.getState().messages.map((m) => m.content)).toEqual([
      'First task message',
      'Second task message',
    ]);
    await w.data.getState().branchFromSnapshot(tip, 'Alternative');
    expect(
      w.data
        .getState()
        .messages.slice(0, 2)
        .map((m) => m.content),
    ).toEqual(['First task message', 'Second task message']);
    expect(w.data.getState().messages.some((m) => m.content === 'Main conversation')).toBe(false);
    await w.data.getState().loadCrux(task.id);
    expect(
      w.data
        .getState()
        .messages.slice(0, 2)
        .map((m) => m.content),
    ).toEqual(['First task message', 'Second task message']);
  });
  it('keeps a Task writable after owned archive refusal and never falls back to a phase write', async () => {
    const { a } = await fixture();
    const db = getSqliteClient();
    vi.spyOn(db, 'setWorkingCopyArchived').mockImplementation(async () => {
      throw new Error('Owned archive refused');
    });
    await expect(archiveTask(a.id, true)).rejects.toThrow('Owned archive refused');
    expect((await findWorkingCopy(a.id))?.phase).toBe('ready');
    expect(db.setWorkingCopyArchived).toHaveBeenCalledWith(a.id, true, expect.any(Number));
    await write(a.id, 'Still writable');
    expect(await read(a.id)).toBe('Still writable');
  });
  it('keeps an archived Task closed after owned reopen refusal', async () => {
    const { a } = await fixture();
    await archiveTask(a.id, true);
    const db = getSqliteClient();
    vi.spyOn(db, 'setWorkingCopyArchived').mockImplementation(async () => {
      throw new Error('Owned reopen refused');
    });
    await expect(archiveTask(a.id, false)).rejects.toThrow('Owned reopen refused');
    expect((await findWorkingCopy(a.id))?.phase).toBe('archived');
    await expect(write(a.id, 'blocked')).rejects.toThrow('closed for editing');
  });
  it('refuses Task archive when protected recovery fails, keeping the Task writable', async () => {
    const { a } = await fixture();
    await write(a.id, 'Still working');
    vi.spyOn(editHistory, 'captureEditCheckpoint').mockRejectedValueOnce(
      new Error('Recovery refused'),
    );
    await expect(archiveTask(a.id, true)).rejects.toThrow('Recovery refused');
    expect((await findWorkingCopy(a.id))?.phase).toBe('ready');
    expect(await read(a.id)).toBe('Still working');
    await write(a.id, 'Can continue');
  });
  it('archives a task without losing its work and permits explicit reopening', async () => {
    const { a } = await fixture();
    await write(a.id, 'Keep me');
    const workspace = await openWorkspace(a.id);
    workspace.data.setState({
      messages: [
        {
          role: 'user',
          content: 'Unmarked task conversation',
          timestamp: new Date().toISOString(),
        },
      ],
    });
    await workspace.data.getState().saveMeta();
    const before = await getServices().dimension.findBySourceAndType(a.id, 'growth');
    const messages = (await getServices().crux.findById(a.id)).meta?.messages;
    await archiveTask(a.id, true);
    expect(await getServices().dimension.findBySourceAndType(a.id, 'growth')).toEqual(before);
    expect((await getServices().crux.findById(a.id)).meta?.messages).toEqual(messages);
    await expect(write(a.id, 'blocked')).rejects.toThrow('closed for editing');
    expect(await read(a.id)).toBe('Keep me');
    await archiveTask(a.id, false);
    await write(a.id, 'Resumed');
    expect(await read(a.id)).toBe('Resumed');
  });
});

it('inherits the entry file into a Task and carries it through a portable archive', async () => {
  const { main } = await fixture();
  const w = await openWorkspace(main.id);
  await w.data.getState().updateCrux({ meta: { settings: { entryFile: 'index.html' } } });
  const task = await createTask(main.id, 'Entry choice');
  expect((await getServices().crux.findById(task.id)).meta?.settings?.entryFile).toBe('index.html');
  const archive = await exportCrux({ cruxId: main.id });
  const restored = await importCrux({ data: archive.blob, mode: 'clone' });
  expect((await getServices().crux.findById(restored.cruxId)).meta?.settings?.entryFile).toBe(
    'index.html',
  );
  const { listWorkingCopies } = await import('./working-copies');
  const copied = (await listWorkingCopies(restored.cruxId)).find(
    (copy) => copy.title === 'Entry choice',
  )!;
  expect((await getServices().crux.findById(copied.id)).meta?.settings?.entryFile).toBe(
    'index.html',
  );
});
