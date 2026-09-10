import * as taskFiles from './task-files';
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

beforeEach(async () => {
  await initServices('local');
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents: 'discard' });
  useWorkspaceRegistry.setState({ entries: [], mru: [], activeId: null, restored: false });
});
const write = (id: string, content: string) =>
  getServices().artifact.create({ resourceId: id, content, meta: { path: 'index.html' } });
async function read(id: string) {
  const a = (await getServices().artifact.findByResource('crux', id)).find(
    (a) => a.meta?.path === 'index.html',
  )!;
  return getServices().artifact.readContent(a.id);
}
async function fixture() {
  const main = await getServices().crux.create({ title: 'Parallel project' });
  await write(main.id, '<h1>Base</h1>');
  await getServices().store.set(main.id, 'count', 2);
  const a = await createTask(main.id, 'Task A');
  const b = await createTask(main.id, 'Task B');
  return { main, a, b };
}
describe('parallel tasks', () => {
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
  it('merges a verified task and records both Growth parents; repeat apply is idempotent', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Task result');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const result = await applyTaskReview(review.id);
    expect(await read(main.id)).toBe('Task result');
    expect((await findWorkingCopy(a.id))?.phase).toBe('merged');
    const snapshot = await getServices().crux.findById(result.resultHead!);
    expect(snapshot.meta?.merge).toMatchObject({
      sourceHead: review.sourceHead,
      targetHead: review.targetHead,
    });
    expect((await applyTaskReview(review.id)).resultHead).toBe(result.resultHead);
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
      meta: { settings: { agentSessionId: 'do-not-resume' } },
    });
    const backup = await exportCrux({ cruxId: main.id });
    expect(backup.failed).toEqual([]);
    const zip = await JSZip.loadAsync(await backup.blob.arrayBuffer());
    expect(JSON.parse(await zip.file('manifest.json')!.async('text')).version).toBe('2.0');
    expect(await zip.file('tasks.json')!.async('text')).not.toContain('do-not-resume');
    const clone = await importCrux({ data: backup.blob, mode: 'clone' });
    expect(await read(clone.cruxId)).toBe('Merged A');
    const { listWorkingCopies } = await import('./working-copies');
    const copies = await listWorkingCopies(clone.cruxId);
    expect(copies).toHaveLength(2);
    expect(await read(copies.find((c) => c.title === 'Task B')!.id)).toBe('Private B');
    for (const copy of copies) {
      expect([a.id, b.id]).not.toContain(copy.id);
      expect([a.taskId, b.taskId]).not.toContain(copy.taskId);
      expect(copy.baseSnapshotId).not.toBe(a.baseSnapshotId);
      const loaded = await openWorkspace(copy.id);
      expect(loaded.cruxId).toBe(clone.cruxId);
    }
    const merge = (await getServices().dimension.findBySourceAndType(clone.cruxId, 'growth')).at(
      -1,
    )!;
    const meta = (await getServices().crux.findById(merge.targetId)).meta?.merge as {
      copyId: string;
      sourceHead: string;
    };
    expect(meta.copyId).toBe(copies.find((c) => c.title === 'Task A')!.id);
    expect(meta.sourceHead).not.toBe(review.sourceHead);
    expect((await getServices().crux.findById(meta.sourceHead)).meta?.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'A conversation' })]),
    );
  });
  it('recovers a failure after Growth without creating a second merge checkpoint', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Recovered result');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const db = getSqliteClient();
    const run = db.run.bind(db);
    let fail = true;
    vi.spyOn(db, 'run').mockImplementation(async (sql, params) => {
      if (fail && sql.includes("SET phase = 'merged'")) {
        fail = false;
        throw new Error('Simulated interruption');
      }
      return run(sql, params);
    });
    await expect(applyTaskReview(review.id)).rejects.toThrow('Simulated interruption');
    await expect(write(main.id, 'blocked')).rejects.toThrow('recovering');
    const before = await getServices().dimension.findBySourceAndType(main.id, 'growth');
    await resumeTaskMerge(review.id);
    expect(await read(main.id)).toBe('Recovered result');
    expect(await getServices().dimension.findBySourceAndType(main.id, 'growth')).toHaveLength(
      before.length,
    );
  });
  it('protects task bases before deleting any snapshot Artifacts', async () => {
    const main = await getServices().crux.create({ title: 'History guard' });
    await write(main.id, 'Base');
    const a = await createTask(main.id, 'Task');
    const before = await read(a.baseSnapshotId);
    await expect(
      (await openWorkspace(main.id)).data.getState().removeLatestSnapshot(),
    ).rejects.toThrow('used by a task');
    expect(await read(a.baseSnapshotId)).toBe(before);
  });
  it('recovers setup from its captured base and keeps restored task membership', async () => {
    const { main, a, b } = await fixture();
    await getSqliteClient().run("UPDATE working_copies SET phase = 'preparing' WHERE id = ?", [
      a.id,
    ]);
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
  it('retries a failed snapshot without duplicating the task transcript', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Result');
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const artifact = getServices().artifact;
    vi.spyOn(artifact, 'cloneArtifactsToSnapshot').mockRejectedValueOnce(
      new Error('Interrupted snapshot'),
    );
    await expect(applyTaskReview(review.id)).rejects.toThrow('Interrupted snapshot');
    await resumeTaskMerge(review.id);
    const messages = (await openWorkspace(main.id)).data.getState().messages;
    expect(messages.filter((m) => m.taskMergeId === review.id)).toHaveLength(1);
  });
  it('preserves unexpected edits after a partial merge and resumes only from known files', async () => {
    const { main, a } = await fixture();
    await write(a.id, 'Result');
    await getServices().artifact.create({
      resourceId: a.id,
      content: 'Second',
      meta: { path: 'second.txt' },
    });
    const review = await prepareTaskReview(a.id);
    await verifyTaskReview(review.id);
    const project = vi.spyOn(taskFiles, 'projectTaskManifest');
    project.mockImplementationOnce(async (id) => {
      await getServices().artifact.create({
        resourceId: id,
        content: 'Result',
        meta: { path: 'index.html' },
        writeThrough: false,
      });
      throw new Error('Interrupted projection');
    });
    await expect(applyTaskReview(review.id)).rejects.toThrow('Interrupted projection');
    await expect(exportCrux({ cruxId: main.id })).rejects.toThrow('pending merge');
    await getServices().artifact.create({
      resourceId: main.id,
      content: 'External edit',
      meta: { path: 'index.html' },
      writeThrough: false,
    });
    await expect(resumeTaskMerge(review.id)).rejects.toThrow('External changes');
    expect(await read(main.id)).toBe('External edit');
    await getServices().artifact.create({
      resourceId: main.id,
      content: 'Result',
      meta: { path: 'index.html' },
      writeThrough: false,
    });
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
    expect(JSON.parse(await zip.file('manifest.json')!.async('text')).version).toBe('2.0');
    await importGarden({ data: backup.blob });
    expect(await read(a.id)).toBe('Archived work');
    expect(await read(b.id)).toBe('Unfinished work');
    expect((await findWorkingCopy(a.id))?.phase).toBe('archived');
    expect(await read(a.baseSnapshotId)).toBe('<h1>Base</h1>');
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
          settings: { agentSessionId: 'private-session' },
        },
      },
      s.messages,
    );
    expect(JSON.stringify(projection)).toContain('Included A');
    expect(JSON.stringify(projection)).not.toContain('Private B');
    expect(JSON.stringify(projection)).not.toContain('/private/local');
    expect(JSON.stringify(projection)).not.toContain('private-session');
    const copy = await getServices().crux.findById(b.id);
    await expect(publishPipeline(copy, [])).rejects.toThrow('Main');
    await expect(unpublishPipeline(copy)).rejects.toThrow('Main');
  });
  it('rejects a damaged backup before creating another Crux', async () => {
    const { main } = await fixture();
    const backup = await exportCrux({ cruxId: main.id });
    const zip = await JSZip.loadAsync(await backup.blob.arrayBuffer());
    const file = Object.keys(zip.files).find(
      (p) => p.startsWith('artifacts/') && !zip.files[p]!.dir,
    )!;
    zip.remove(file);
    await expect(
      importCrux({ data: await zip.generateAsync({ type: 'arraybuffer' }), mode: 'clone' }),
    ).rejects.toThrow('missing an Artifact');
    expect(await getServices().crux.listAll()).toHaveLength(1);
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
  it('archives a task without losing its work and permits explicit reopening', async () => {
    const { a } = await fixture();
    await write(a.id, 'Keep me');
    await archiveTask(a.id, true);
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
