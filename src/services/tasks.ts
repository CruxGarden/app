import { captureEditCheckpoint } from './edit-history';
import { collectChainMessages } from './growth';
import type { Crux } from '@/api/types';
import { getServices } from './index';
import { isEmbeddedApp } from './embedded-app';
import { getSqliteClient } from './sqlite/client';
import { buildInsert } from './sqlite/helpers';
import { createProjectFolder } from './project-folder';
import { syncAgentsMd } from './agents-md';
import { documentsFor } from './workspace-documents';
import {
  serializeCopy,
  findWorkingCopy,
  listWorkingCopies,
  lockedContentOwners,
  copyIdentity,
  announceTasksChanged,
  type WorkingCopy,
} from './working-copies';
import {
  indexedTaskManifest,
  captureTaskManifest,
  indexTaskManifest,
  projectTaskManifest,
} from './task-files';
import {
  mergeTaskManifests,
  taskManifestKey,
  sameTaskFile,
  type TaskManifest,
  type TaskConflict,
  type TaskResolution,
} from './task-manifest';
import { openWorkspace, getWorkspace, type Workspace } from '@/stores/workspaceRegistry';

export interface TaskReview {
  id: string;
  cruxId: string;
  copyId: string;
  candidateId: string;
  base: TaskManifest;
  main: TaskManifest;
  task: TaskManifest;
  manifest: TaskManifest;
  conflicts: TaskConflict[];
  resolutions: Record<string, TaskResolution>;
  sourceHead?: string;
  targetHead?: string;
  sourceState?: NonNullable<TaskReview['resultState']>;
  targetState?: NonNullable<TaskReview['resultState']>;
  phase: 'review' | 'applying' | 'merged' | 'cancelled';
  verifiedKey?: string;
  verificationLog?: string;
  previewUrl?: string;
  resultHead?: string;
  resultState?: {
    root: string;
    workspace: { parentId: string | null; messages: unknown[]; entryFile: string | null };
  };
}
const operations = new Set<string>();
async function settled<T>(ids: string[], fn: (workspaces: Workspace[]) => Promise<T>): Promise<T> {
  if (ids.some((id) => operations.has(id)))
    throw new Error('Another task operation is using this workspace.');
  ids.forEach((id) => operations.add(id));
  const workspaces: Workspace[] = [];
  try {
    for (const id of ids) {
      const w = await openWorkspace(id);
      const s = w.data.getState();
      if (
        s.closing ||
        s.isStreaming ||
        ['planning', 'running', 'checking'].includes(s.turnJob?.status ?? '') ||
        s.publishPhase ||
        s.uploadProgress ||
        s.pendingDeletes.length ||
        w.ui.getState().pendingAgentApprovals.length
      )
        throw new Error('Wait for this workspace’s work to finish, or stop it first.');
      if (s.viewingSnapshotId)
        throw new Error('Return to the current workspace before managing tasks.');
      const docs = documentsFor(w.data, w.ui);
      if (docs.hasDirty())
        throw new Error('Save your open Artifacts before starting or reviewing a task.');
      w.data.setState({ closing: true });
      workspaces.push(w);
      while (w.operations.size) await Promise.all([...w.operations]);
      await docs.drain();
      await s.drain();
    }
    ids.forEach((id) => lockedContentOwners.add(id));
    return await fn(workspaces);
  } finally {
    for (const w of workspaces) w.data.setState({ closing: false });
    ids.forEach((id) => {
      operations.delete(id);
      lockedContentOwners.delete(id);
    });
  }
}
async function checkpoint(w: Workspace, label: string): Promise<string> {
  const manifest = await captureTaskManifest(w.id);
  await indexTaskManifest(w.id, manifest);
  await w.data.getState().refreshArtifacts();
  await w.data.getState().createSnapshot({ label, silent: true, taskOperation: true });
  const tip = w.data.getState().growths.at(-1)?.targetId;
  if (!tip) throw new Error('Could not capture the starting snapshot.');
  return tip;
}
async function prepareTaskFolder(copy: WorkingCopy): Promise<string | null> {
  const db = getSqliteClient();
  if (db.prepareWorkingCopyFolder) return db.prepareWorkingCopyFolder(copy.id, copy.revision);
  const folder = await createProjectFolder(`task-${copy.id}`);
  await db.run('UPDATE working_copies SET project_folder = ? WHERE id = ?', [folder, copy.id]);
  return folder;
}
async function finishOwnedTaskSetup(id: string, phase: 'ready' | 'failed'): Promise<boolean> {
  const db = getSqliteClient();
  if (!db.finishWorkingCopySetup) return false;
  const current = await findWorkingCopy(id);
  if (!current) throw new Error('Task setup is missing.');
  await db.finishWorkingCopySetup(id, current.revision, phase);
  return true;
}
async function provision(
  owner: Crux,
  title: string,
  baseId: string,
  manifest: TaskManifest,
  role: 'task' | 'review',
  prompt = '',
): Promise<WorkingCopy> {
  const db = getSqliteClient();
  const id = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const now = new Date().toISOString();
  // Only portable project guidance is inherited; never provider resume/auth/approval state.
  const sourceMeta = owner.meta ?? {};
  const meta = {
    ...Object.fromEntries(
      ['kind', 'template', 'contentModel', 'personaSnapshots', 'authorSnapshots']
        .filter((k) => sourceMeta[k] !== undefined)
        .map((k) => [k, sourceMeta[k]]),
    ),
    settings: {
      model: sourceMeta.settings?.model,
      systemPrompt: sourceMeta.settings?.systemPrompt,
      palette: sourceMeta.settings?.palette,
      snapshotFrequency: sourceMeta.settings?.snapshotFrequency,
      verifyOnDone: sourceMeta.settings?.verifyOnDone,
      entryFile: sourceMeta.settings?.entryFile,
      activeBranch: baseId,
    },
    messages: prompt ? [{ role: 'user', content: prompt, timestamp: now }] : [],
    growthCount: 0,
  };
  const copy = {
    id,
    cruxId: owner.id,
    taskId,
    title,
    baseSnapshotId: baseId,
    role,
    phase: 'preparing',
    meta,
    projectFolder: null,
    revision: 0,
    created: now,
    updated: now,
  };
  if (db.createWorkingCopy) {
    await db.createWorkingCopy({
      id,
      cruxId: owner.id,
      taskId,
      title,
      baseSnapshotId: baseId,
      role,
      meta,
    });
  } else {
    const insert = buildInsert('working_copies', copy);
    await db.run(insert.sql, insert.params);
  }
  try {
    await prepareTaskFolder((await findWorkingCopy(id))!);
    await projectTaskManifest(id, {}, manifest);
    // The API already copied every preview slot with its preparing record.
    // Retain the legacy path only when that complete command is unavailable.
    if (!db.createWorkingCopy) {
      const rows = await db.all<Record<string, unknown>>('SELECT * FROM store WHERE crux_id = ?', [
        owner.id,
      ]);
      for (const row of rows) {
        const insertStore = buildInsert('store', { ...row, id: crypto.randomUUID(), crux_id: id });
        await db.run(insertStore.sql, insertStore.params);
      }
    }
    await syncAgentsMd(await getServices().crux.findById(id), null);
    if (!(await finishOwnedTaskSetup(id, 'ready')))
      await db.run("UPDATE working_copies SET phase = 'ready' WHERE id = ?", [id]);
    announceTasksChanged();
    return (await findWorkingCopy(id))!;
  } catch (error) {
    try {
      if (!(await finishOwnedTaskSetup(id, 'failed')))
        await db.run("UPDATE working_copies SET phase = 'failed' WHERE id = ?", [id]);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        `${(error as Error).message} Task setup remains unfinished.`,
        { cause: recoveryError },
      );
    } finally {
      announceTasksChanged();
    }
    throw error;
  }
}
export async function createTask(cruxId: string, title: string, prompt = ''): Promise<WorkingCopy> {
  if (!title.trim()) throw new Error('Give the task a name.');
  if (await findWorkingCopy(cruxId)) throw new Error('Start new tasks from Main.');
  return settled([cruxId], async ([main]) => {
    const base = await checkpoint(main!, `Before task: ${title.trim()}`);
    return provision(
      main!.data.getState().crux!,
      title.trim(),
      base,
      await indexedTaskManifest(base),
      'task',
      prompt,
    );
  });
}
async function head(w: Workspace): Promise<string> {
  await checkpoint(w, 'Before task review');
  return w.data.getState().growths.at(-1)!.targetId;
}
async function isAncestor(baseId: string, tip: string): Promise<boolean> {
  const seen = new Set<string>();
  const queue = [tip];
  while (queue.length) {
    const id = queue.pop()!;
    if (id === baseId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = await getServices().crux.findById(id);
    const parent = node.meta?.parentCruxId;
    if (typeof parent === 'string') queue.push(parent);
    const merge = node.meta?.merge as { sourceHead?: string; targetHead?: string } | undefined;
    if (merge?.sourceHead) queue.push(merge.sourceHead);
    if (merge?.targetHead) queue.push(merge.targetHead);
  }
  return false;
}
async function saveReview(review: TaskReview, expected?: TaskReview): Promise<void> {
  const db = getSqliteClient();
  if (db.saveTaskReview) {
    await db.saveTaskReview(
      JSON.stringify(review),
      expected ? JSON.stringify(expected) : undefined,
    );
    announceTasksChanged();
    return;
  }
  await db.run(
    'INSERT INTO task_merges (id, crux_id, copy_id, candidate_id, phase, data, created) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET phase = excluded.phase, data = excluded.data',
    [
      review.id,
      review.cruxId,
      review.copyId,
      review.candidateId,
      review.phase,
      JSON.stringify(review),
      new Date().toISOString(),
    ],
  );
  announceTasksChanged();
}
export async function loadTaskReview(id: string): Promise<TaskReview> {
  const row = await getSqliteClient().get<{ data: string }>(
    'SELECT data FROM task_merges WHERE id = ?',
    [id],
  );
  if (!row) throw new Error('Review not found.');
  return JSON.parse(row.data) as TaskReview;
}
export async function pendingTaskMerge(cruxId: string): Promise<TaskReview | null> {
  const row = await getSqliteClient().get<{ data: string }>(
    "SELECT data FROM task_merges WHERE crux_id = ? AND phase = 'applying'",
    [cruxId],
  );
  return row ? (JSON.parse(row.data) as TaskReview) : null;
}
export async function prepareTaskReview(copyId: string): Promise<TaskReview> {
  const copy = await findWorkingCopy(copyId);
  if (!copy || copy.phase !== 'ready' || copy.role !== 'task')
    throw new Error('Choose an unfinished task to review.');
  return settled([copy.cruxId, copyId], async ([main, task]) => {
    const db = getSqliteClient();
    const owned = !!db.saveTaskReview;
    if (owned) {
      for (const workspace of [main!, task!]) {
        await indexTaskManifest(workspace.id, await captureTaskManifest(workspace.id));
        await workspace.data.getState().saveMeta();
        await workspace.data.getState().refreshArtifacts();
      }
    }
    const targetHead = owned
      ? main!.data.getState().crux?.meta?.settings?.activeBranch ||
        main!.data.getState().growths.at(-1)?.targetId
      : await head(main!);
    const sourceHead = owned ? undefined : await head(task!);
    if (!targetHead || !(await isAncestor(copy.baseSnapshotId, targetHead)))
      throw new Error(
        'Main was restored past this task’s base. Reconcile the histories before merging.',
      );
    const base = await indexedTaskManifest(copy.baseSnapshotId);
    const target = await indexedTaskManifest(owned ? copy.cruxId : targetHead);
    const source = await indexedTaskManifest(owned ? copyId : sourceHead!);
    const merged = await mergeTaskManifests(
      base,
      target,
      source,
      (fp) => db.blobRead(fp),
      (fp, bytes) => db.blobWrite(fp, bytes),
    );
    // On conflicts, preview stays on Main until explicit resolution finishes.
    const candidate = await provision(
      main!.data.getState().crux!,
      `Review ${copy.title}`,
      owned ? copy.baseSnapshotId : targetHead,
      merged.conflicts.length ? target : merged.manifest,
      'review',
    );
    const review: TaskReview = {
      id: crypto.randomUUID(),
      cruxId: copy.cruxId,
      copyId,
      candidateId: candidate.id,
      base,
      main: target,
      task: source,
      manifest: merged.manifest,
      conflicts: merged.conflicts,
      resolutions: {},
      ...(!owned ? { sourceHead, targetHead } : {}),
      phase: 'review',
    };
    await saveReview(review);
    return owned ? loadTaskReview(review.id) : review;
  });
}
async function resolveTaskReviewCore(
  id: string,
  resolutions: Record<string, TaskResolution>,
): Promise<TaskReview> {
  const review = await loadTaskReview(id);
  if (review.phase !== 'review') throw new Error('This review has already been applied.');
  const db = getSqliteClient();
  const result = await mergeTaskManifests(
    review.base,
    review.main,
    review.task,
    (fp) => db.blobRead(fp),
    (fp, data) => db.blobWrite(fp, data),
    resolutions,
  );
  if (!result.conflicts.length)
    await projectTaskManifest(
      review.candidateId,
      await indexedTaskManifest(review.candidateId),
      result.manifest,
    );
  const updated: TaskReview = {
    ...review,
    ...result,
    resolutions,
    verifiedKey: undefined,
    verificationLog: undefined,
  };
  await saveReview(updated, review);
  return updated;
}
async function verifyTaskReviewCore(id: string): Promise<TaskReview> {
  const review = await loadTaskReview(id);
  if (review.phase !== 'review' || review.conflicts.length)
    throw new Error('Resolve the conflicts before checking the combined result.');
  const before = await captureTaskManifest(review.candidateId);
  if (taskManifestKey(before) !== taskManifestKey(review.manifest))
    throw new Error('The candidate changed. Prepare a new review.');
  let log = 'Static Artifacts: no build step. Inspect the combined preview before merging.';
  // An embedded app ships its runtime prebuilt; its package.json rebuilds the
  // editor from source. Only a Task that changed app sources needs that build.
  // Project data (records, imported assets, outputs, notebooks) does not.
  const changed = new Set<string>();
  for (const path of new Set([...Object.keys(review.main), ...Object.keys(review.manifest)]))
    if (review.main[path]?.fingerprint !== review.manifest[path]?.fingerprint) changed.add(path);
  const contentOnly = [...changed].every((path) =>
    /^(data|assets|exports|cruxspace-assets|notebook|mockups|music)\//.test(path),
  );
  const owner = await getServices().crux.findById(review.cruxId);
  if (before['package.json'] && isEmbeddedApp(owner) && contentOnly) {
    log = `Embedded app: ${changed.size} project file(s) changed and no app source; the prebuilt runtime stands. Inspect the combined preview before merging.`;
  } else if (before['package.json']) {
    const { checkSiteBuild } = await import('./site');
    const result = await checkSiteBuild(review.candidateId);
    if (!result?.ok)
      throw new Error(result?.log || 'Building the combined result requires Desktop Mode.');
    log = result.log;
  }
  const after = await captureTaskManifest(review.candidateId);
  if (taskManifestKey(after) !== taskManifestKey(before)) {
    await indexTaskManifest(review.candidateId, after);
    const changed: TaskReview = {
      ...review,
      manifest: after,
      verifiedKey: undefined,
      verificationLog: `${log}\nSetup or the build changed source Artifacts. Review the updated changes and check again.`,
      previewUrl: undefined,
    };
    await saveReview(changed, review);
    return changed;
  }
  let previewUrl: string | undefined;
  if (typeof window !== 'undefined' && window.electronAPI?.preview) {
    const { startDevServer } = await import('./site');
    const { startPreviewServer } = await import('./preview-server');
    previewUrl =
      (await (Object.keys(before).some((path) => /^astro\.config\.(mjs|js|ts|cjs)$/.test(path))
        ? startDevServer(review.candidateId)
        : startPreviewServer(review.candidateId))) ?? undefined;
  }
  const verified = {
    ...review,
    verifiedKey: taskManifestKey(after),
    verificationLog: log,
    previewUrl,
  };
  await saveReview(verified, review);
  return verified;
}
async function applyTaskReviewCore(id: string): Promise<TaskReview> {
  const review = await loadTaskReview(id);
  if (review.phase === 'merged') return review;
  if (
    review.phase !== 'review' ||
    review.conflicts.length ||
    review.verifiedKey !== taskManifestKey(review.manifest)
  )
    throw new Error('Check the resolved candidate before merging.');
  return settled([review.cruxId, review.copyId], async ([main, task]) => {
    for (const [copyId, expected] of [
      [review.cruxId, review.main],
      [review.copyId, review.task],
      [review.candidateId, review.manifest],
    ] as const)
      if (taskManifestKey(await captureTaskManifest(copyId)) !== taskManifestKey(expected))
        throw new Error('The files changed after review. Prepare a new review before merging.');
    const liveTip = (w: Workspace) =>
      w.data.getState().crux?.meta?.settings?.activeBranch ||
      w.data.getState().growths.at(-1)?.targetId;
    if (
      !getSqliteClient().beginTaskMerge &&
      (liveTip(main!) !== review.targetHead || liveTip(task!) !== review.sourceHead)
    )
      throw new Error('Growth changed after review. Prepare a new review.');
    const applying: TaskReview = { ...review, phase: 'applying' };
    const db = getSqliteClient();
    if (db.beginTaskMerge) {
      // Admit the exact checked journal before any file projection; never fall
      // back to raw SQL after the owner rejects stale or competing work.
      await db.beginTaskMerge(id, JSON.stringify(review));
      announceTasksChanged();
    } else await saveReview(applying); // durable before any destructive write
    return completeMerge(applying, main!);
  });
}
async function completeMerge(review: TaskReview, main: Workspace): Promise<TaskReview> {
  const current = await captureTaskManifest(review.cruxId);
  for (const path of new Set([
    ...Object.keys(current),
    ...Object.keys(review.main),
    ...Object.keys(review.manifest),
  ])) {
    if (
      !sameTaskFile(current[path], review.main[path]) &&
      !sameTaskFile(current[path], review.manifest[path])
    )
      throw new Error(
        `External changes found at ${path}. Keep them safe and resolve before resuming this merge.`,
      );
  }
  const folder = main.data.getState().crux?.meta?.projectFolder;
  if (typeof folder === 'string' && typeof window !== 'undefined') {
    await window.electronAPI?.devserver?.stop(folder);
    await window.electronAPI?.preview?.stop(folder);
  }
  const db = getSqliteClient();
  if (db.fileContent) await db.fileContent.finishProjection(review.cruxId);
  else await projectTaskManifest(review.cruxId, current, review.manifest);
  if (
    taskManifestKey(await captureTaskManifest(review.cruxId)) !== taskManifestKey(review.manifest)
  )
    throw new Error('Main changed during the merge. The recovery journal has been kept.');
  if (db.completeTaskMerge) {
    await db.completeTaskMerge(review.id);
    announceTasksChanged();
    await main.data.getState().loadCrux(main.id);
    await releaseTaskReviewCore(review.id);
    const taskWorkspace = getWorkspace(review.copyId);
    if (taskWorkspace) await taskWorkspace.data.getState().loadCrux(review.copyId);
    return loadTaskReview(review.id);
  }
  // Parked Web Mode still uses its existing snapshot-based Task implementation.
  // Reuse a checkpoint after a crash between recording Growth and completing the journal.
  const existing = await db.get<{ id: string }>(
    "SELECT c.id FROM cruxes c JOIN dimensions d ON d.target_id = c.id WHERE json_extract(c.meta, '$.merge.id') = ? AND d.type = 'growth'",
    [review.id],
  );
  let resultHead = existing?.id;
  if (!resultHead) {
    const copy = await findWorkingCopy(review.copyId);
    const transcript = await collectChainMessages(review.sourceHead!, async (id) => {
      const node = await getServices().crux.findById(id);
      if (node.meta?.contentOwnerId !== review.copyId) return null;
      return {
        id,
        parentCruxId: node.meta?.parentCruxId ?? null,
        messages: node.meta?.messages ?? [],
      };
    });
    const collaboration = transcript
      .map((m) => `**${m.role === 'user' ? 'You' : 'Collaborator'}**\n\n${m.content}`)
      .join('\n\n');
    if (!main.data.getState().messages.some((m) => m.taskMergeId === review.id))
      main.data.getState().addMessage({
        role: 'assistant',
        taskMergeId: review.id,
        content: `Merged task: ${copy?.title ?? 'Task'}.\n\n${collaboration ? `Task Collaboration\n\n${collaboration}` : 'Its Growth is preserved in the task.'}`,
        timestamp: new Date().toISOString(),
      });
    await main.data.getState().refreshArtifacts();
    await main.data.getState().createSnapshot({
      label: `Merged ${copy?.title ?? 'task'}`,
      silent: true,
      taskOperation: true,
      merge: {
        id: review.id,
        taskId: copy?.taskId,
        copyId: review.copyId,
        baseId: copy?.baseSnapshotId,
        sourceHead: review.sourceHead,
        targetHead: review.targetHead,
        verifiedKey: review.verifiedKey,
        resolutions: review.resolutions,
      },
    });
    resultHead = main.data.getState().growths.at(-1)!.targetId;
  }
  if (existing) {
    main.data.getState().patchCruxMeta({
      settings: { ...main.data.getState().crux?.meta?.settings, activeBranch: existing.id },
    });
    await main.data.getState().saveMeta();
    await main.data.getState().loadCrux(main.id);
  }
  const done: TaskReview = { ...review, phase: 'merged', resultHead };
  await db.run("UPDATE working_copies SET phase = 'merged', revision = revision + 1 WHERE id = ?", [
    review.copyId,
  ]);
  await saveReview(done);
  await releaseTaskReviewCore(review.id);
  const taskWorkspace = getWorkspace(review.copyId);
  if (taskWorkspace) await taskWorkspace.data.getState().loadCrux(review.copyId);
  return done;
}
async function resumeTaskMergeCore(id: string): Promise<TaskReview> {
  const review = await loadTaskReview(id);
  if (review.phase === 'merged') return review;
  if (review.phase !== 'applying') throw new Error('There is no interrupted merge to recover.');
  return settled([review.cruxId, review.copyId], async ([main]) => completeMerge(review, main!));
}
export async function archiveTask(id: string, archived: boolean): Promise<void> {
  await settled([id], async () => {
    const copy = await findWorkingCopy(id);
    if (!copy || copy.phase === 'merged') throw new Error('Merged tasks are preserved in Growth.');
    if (copy.role !== 'task' || !['ready', 'archived'].includes(copy.phase))
      throw new Error('Only ready or archived tasks can be archived or reopened.');
    if (archived) {
      const manifest = await captureTaskManifest(id);
      await indexTaskManifest(id, manifest);
      await captureEditCheckpoint(id, 'safety');
    }
    // Content preparation can update metadata/revision. Capture its final revision
    // and let the owner reject a subsequent concurrent edit instead of overwriting it.
    const prepared = await findWorkingCopy(id);
    if (!prepared) throw new Error('Working Copy not found.');
    const db = getSqliteClient();
    if (db.setWorkingCopyArchived) {
      await db.setWorkingCopyArchived(id, archived, prepared.revision);
    } else {
      const result = await db.run(
        'UPDATE working_copies SET phase = ?, revision = revision + 1, updated = ? WHERE id = ? AND revision = ?',
        [archived ? 'archived' : 'ready', new Date().toISOString(), id, prepared.revision],
      );
      if (result.changes !== 1)
        throw new Error('This task changed while saving. Reload it before retrying.');
    }
    if (copy.projectFolder && typeof window !== 'undefined') {
      const api = window.electronAPI?.project;
      if (archived) await api?.unwatch(copy.projectFolder);
      else await api?.watch(copy.projectFolder);
    }
    const w = getWorkspace(id);
    if (w) await w.data.getState().loadCrux(id);
    announceTasksChanged();
  });
}
export function mainIdFor(crux: Crux): string {
  return copyIdentity(crux)?.cruxId ?? crux.id;
}

/** Release the candidate's runtime resources; retained files remain recoverable. */
async function releaseTaskReviewCore(id: string): Promise<void> {
  const review = await loadTaskReview(id);
  if (review.phase === 'applying') return;
  const { stopPreviewServer } = await import('./preview-server');
  const { stopDevServer } = await import('./site');
  await stopPreviewServer(review.candidateId);
  await stopDevServer(review.candidateId);
  const db = getSqliteClient();
  if (db.releaseTaskReview) {
    await db.releaseTaskReview(id);
    announceTasksChanged();
  } else {
    await db.run("UPDATE working_copies SET phase = 'archived' WHERE id = ?", [review.candidateId]);
    if (review.phase === 'review')
      await saveReview({ ...review, phase: 'cancelled', previewUrl: undefined });
  }
}

/** Capture all writable copies for a coherent private archive, without generating new Growth. */
export async function withCapturedTaskGraph<T>(
  cruxId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const copies = await listWorkingCopies(cruxId);
  return settled(
    [cruxId, ...copies.filter((c) => c.phase === 'ready').map((c) => c.id)],
    async (workspaces) => {
      for (const w of workspaces) {
        await indexTaskManifest(w.id, await captureTaskManifest(w.id));
        await w.data.getState().refreshArtifacts();
        await w.data.getState().saveMeta();
      }
      return operation();
    },
  );
}

// Review operations include long builds; disposal waits for them before stopping resources.
export const resolveTaskReview = (id: string, choices: Record<string, TaskResolution>) =>
  serializeCopy(`review:${id}`, () => resolveTaskReviewCore(id, choices));
export const verifyTaskReview = (id: string) =>
  serializeCopy(`review:${id}`, () => verifyTaskReviewCore(id));
export const applyTaskReview = (id: string) =>
  serializeCopy(`review:${id}`, () => applyTaskReviewCore(id));
export const resumeTaskMerge = (id: string) =>
  serializeCopy(`review:${id}`, () => resumeTaskMergeCore(id));
export const releaseTaskReview = (id: string) =>
  serializeCopy(`review:${id}`, () => releaseTaskReviewCore(id));

/** Retry an interrupted initial projection, refusing to overwrite unexpected work. */
export async function recoverTaskSetup(id: string): Promise<void> {
  await settled([id], async ([workspace]) => {
    const copy = await findWorkingCopy(id);
    if (!copy || copy.role !== 'task' || !['preparing', 'failed'].includes(copy.phase))
      throw new Error('This task does not need setup recovery.');
    const base = await indexedTaskManifest(copy.baseSnapshotId);
    let current: TaskManifest = {};
    const api = typeof window === 'undefined' ? undefined : window.electronAPI?.project;
    if (copy.projectFolder && (await api?.folderExists(copy.projectFolder)))
      current = await captureTaskManifest(id);
    for (const [path, file] of Object.entries(current))
      if (!sameTaskFile(file, base[path]))
        throw new Error(`Keep the unexpected changes at ${path} safe before recovering setup.`);
    const db = getSqliteClient();
    if (
      db.prepareWorkingCopyFolder ||
      !copy.projectFolder ||
      !(await api?.folderExists(copy.projectFolder))
    )
      await prepareTaskFolder(copy);
    await projectTaskManifest(id, current, base);
    await syncAgentsMd(await getServices().crux.findById(id), null);
    if (!(await finishOwnedTaskSetup(id, 'ready')))
      await db.run(
        "UPDATE working_copies SET phase = 'ready', revision = revision + 1 WHERE id = ?",
        [id],
      );
    const ready = await findWorkingCopy(id);
    if (ready?.projectFolder) await api?.watch(ready.projectFolder);
    await workspace!.data.getState().loadCrux(id);
    announceTasksChanged();
  });
}
