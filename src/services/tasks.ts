import { captureEditCheckpoint } from './edit-history';
import type { Crux, CruxMeta } from '@/api/types';
import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import type { ISqliteClient } from './sqlite/client';
import { getServices } from './index';
import { isEmbeddedApp } from './embedded-app';
import { getSqliteClient } from './sqlite/client';
import { taskStorage } from './task-storage';
import { syncAgentsMd } from './agents-md';
import { documentsFor } from './workspace-documents';
import { flushNotebook, notebookIsDirty } from './notebook-lifecycle';
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
  startingTaskManifest,
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
  /** Actual destination; the owning Crux stays cruxId. */
  targetId?: string;
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
/** Internal delegation admission: only the exact owning turn can participate while active. */
export interface TaskTurnContext {
  data: StoreApi<CruxState>;
  jobId: string;
  signal: AbortSignal;
}
function assertTaskTurn(context?: TaskTurnContext) {
  if (!context) return;
  const state = context.data.getState();
  if (
    context.signal.aborted ||
    state.closing ||
    state.turnJob?.id !== context.jobId ||
    !state.crux ||
    getWorkspace(state.crux.id)?.data !== context.data
  )
    throw new Error('The parent turn stopped or its workspace changed.');
}
async function settled<T>(
  ids: string[],
  fn: (workspaces: Workspace[]) => Promise<T>,
  context?: TaskTurnContext,
): Promise<T> {
  assertTaskTurn(context);
  if (ids.some((id) => operations.has(id)))
    throw new Error('Another task operation is using this workspace.');
  ids.forEach((id) => operations.add(id));
  const workspaces: Workspace[] = [];
  try {
    for (const id of ids) {
      const w = await openWorkspace(id);
      const s = w.data.getState();
      const participating = context?.data === w.data;
      if (
        s.closing ||
        (!participating &&
          (s.isStreaming ||
            ['planning', 'running', 'checking'].includes(s.turnJob?.status ?? ''))) ||
        s.publishPhase ||
        s.uploadProgress ||
        s.pendingDeletes.length ||
        w.ui.getState().pendingAgentApprovals.length
      )
        throw new Error('Wait for this workspace’s work to finish, or stop it first.');
      if (s.viewingSnapshotId)
        throw new Error('Return to the current workspace before managing tasks.');
      const docs = documentsFor(w.data, w.ui);
      // An embedded app can still hold a draft — a reopened project marks
      // itself unsaved until its first save. Ask it to save (bounded) before
      // refusing, as its own Save would: exporting from the Workshop after a
      // restart said "Export failed" with nothing actually unsaved.
      const cruxId = s.crux?.id;
      if (notebookIsDirty(cruxId)) await flushNotebook(cruxId).catch(() => {});
      if (docs.hasDirty())
        throw new Error('Save your open Artifacts before starting or reviewing a task.');
      if (!participating) w.data.setState({ closing: true });
      workspaces.push(w);
      // The participating turn is itself in this set. Waiting on it deadlocks.
      if (!participating) while (w.operations.size) await Promise.all([...w.operations]);
      await docs.drain();
      await s.drain();
    }
    ids.forEach((id) => lockedContentOwners.add(id));
    assertTaskTurn(context);
    return await fn(workspaces);
  } finally {
    for (const w of workspaces) if (context?.data !== w.data) w.data.setState({ closing: false });
    ids.forEach((id) => {
      operations.delete(id);
      lockedContentOwners.delete(id);
    });
  }
}
async function prepareTaskFolder(copy: WorkingCopy): Promise<string | null> {
  return taskStorage().prepareWorkingCopyFolder(copy.id, copy.revision);
}
async function finishOwnedTaskSetup(id: string, phase: 'ready' | 'failed'): Promise<void> {
  const db = taskStorage();
  const current = await findWorkingCopy(id);
  if (!current) throw new Error('Task setup is missing.');
  await db.finishWorkingCopySetup(id, current.revision, phase);
}
async function provision(
  owner: Crux,
  title: string,
  manifest: TaskManifest,
  role: 'task' | 'review',
  prompt = '',
  frozenBase?: NonNullable<Parameters<NonNullable<ISqliteClient['createWorkingCopy']>>[0]['base']>,
): Promise<WorkingCopy> {
  const db = taskStorage();
  const id = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const cruxId = copyIdentity(owner)?.cruxId ?? owner.id;
  const now = new Date().toISOString();
  // Only portable project guidance is inherited; never provider resume/auth/approval state.
  const sourceMeta: CruxMeta = frozenBase
    ? (frozenBase.expectedMeta as CruxMeta)
    : owner.id !== cruxId
      ? (await findWorkingCopy(owner.id))!.meta
      : ((await getServices().crux.findById(owner.id)).meta ?? {});
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
      activeBranch: null,
    },
    messages: prompt ? [{ role: 'user', content: prompt, timestamp: now }] : [],
    growthCount: 0,
  };
  await db.createWorkingCopy({
    id,
    cruxId,
    taskId,
    title,
    base: frozenBase ?? {
      ...(owner.id !== cruxId ? { sourceId: owner.id } : {}),
      expected: await db.fileContent.head(owner.id),
      expectedMeta: sourceMeta,
    },
    role,
    meta,
  });
  try {
    if (role === 'task') manifest = await startingTaskManifest(id);
    await prepareTaskFolder((await findWorkingCopy(id))!);
    await projectTaskManifest(id, {}, manifest);
    await syncAgentsMd(await getServices().crux.findById(id), null);
    await finishOwnedTaskSetup(id, 'ready');
    announceTasksChanged();
    return (await findWorkingCopy(id))!;
  } catch (error) {
    try {
      await finishOwnedTaskSetup(id, 'failed');
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
/** Capture once, then require the same source for every worker and combined result. */
export async function createDelegatedTasks(
  context: TaskTurnContext,
  tasks: { title: string; prompt: string }[],
) {
  taskStorage();
  const id = context.data.getState().crux?.id;
  if (!id) throw new Error('Retained Tasks are unavailable.');
  return settled(
    [id],
    async ([workspace]) => {
      await indexTaskManifest(id, await captureTaskManifest(id));
      await workspace!.data.getState().saveMeta();
      const source = await getServices().crux.findById(id);
      const copy = await findWorkingCopy(id);
      const base = {
        ...(copy ? { sourceId: id } : {}),
        expected: await getSqliteClient().fileContent!.head(id),
        expectedMeta: copy?.meta ?? source.meta ?? {},
      };
      const manifest = await indexedTaskManifest(id);
      const copies: (WorkingCopy | null)[] = [],
        errors: (string | undefined)[] = [];
      for (const task of tasks) {
        try {
          assertTaskTurn(context);
          copies.push(await provision(source, task.title, manifest, 'task', task.prompt, base));
          errors.push(undefined);
        } catch (error) {
          copies.push(null);
          errors.push((error as Error).message);
        }
      }
      return { copies, errors };
    },
    context,
  );
}
export async function createTask(cruxId: string, title: string, prompt = ''): Promise<WorkingCopy> {
  taskStorage();
  if (!title.trim()) throw new Error('Give the task a name.');
  if (await findWorkingCopy(cruxId)) throw new Error('Start new tasks from Main.');
  return settled([cruxId], async ([main]) => {
    await indexTaskManifest(cruxId, await captureTaskManifest(cruxId));
    await main!.data.getState().saveMeta();
    return provision(
      main!.data.getState().crux!,
      title.trim(),
      await indexedTaskManifest(cruxId),
      'task',
      prompt,
    );
  });
}
async function saveReview(review: TaskReview, expected?: TaskReview): Promise<void> {
  await taskStorage().saveTaskReview(
    JSON.stringify(review),
    expected ? JSON.stringify(expected) : undefined,
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
export async function prepareTaskReview(
  copyId: string,
  context?: TaskTurnContext,
): Promise<TaskReview> {
  const db = taskStorage();
  const copy = await findWorkingCopy(copyId);
  if (!copy || copy.phase !== 'ready' || copy.role !== 'task')
    throw new Error('Choose an unfinished task to review.');
  const targetId = copy.baseState?.sourceId ?? copy.cruxId;
  return settled(
    [targetId, copyId],
    async ([main, task]) => {
      for (const workspace of [main!, task!]) {
        await indexTaskManifest(workspace.id, await captureTaskManifest(workspace.id));
        await workspace.data.getState().saveMeta();
        await workspace.data.getState().refreshArtifacts();
      }
      const base = await startingTaskManifest(copy.id);
      const target = await indexedTaskManifest(targetId);
      const source = await indexedTaskManifest(copyId);
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
        merged.conflicts.length ? target : merged.manifest,
        'review',
      );
      const review: TaskReview = {
        id: crypto.randomUUID(),
        cruxId: copy.cruxId,
        targetId,
        copyId,
        candidateId: candidate.id,
        base,
        main: target,
        task: source,
        manifest: merged.manifest,
        conflicts: merged.conflicts,
        resolutions: {},
        phase: 'review',
      };
      await saveReview(review);
      return loadTaskReview(review.id);
    },
    context,
  );
}
async function resolveTaskReviewCore(
  id: string,
  resolutions: Record<string, TaskResolution>,
): Promise<TaskReview> {
  taskStorage();
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
  taskStorage();
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
async function applyTaskReviewCore(id: string, context?: TaskTurnContext): Promise<TaskReview> {
  taskStorage();
  const review = await loadTaskReview(id);
  if (review.phase === 'merged') return review;
  if (
    review.phase !== 'review' ||
    review.conflicts.length ||
    review.verifiedKey !== taskManifestKey(review.manifest)
  )
    throw new Error('Check the resolved candidate before merging.');
  const targetId = review.targetId ?? review.cruxId;
  return settled(
    [targetId, review.copyId],
    async ([main]) => {
      for (const [copyId, expected] of [
        [targetId, review.main],
        [review.copyId, review.task],
        [review.candidateId, review.manifest],
      ] as const)
        if (taskManifestKey(await captureTaskManifest(copyId)) !== taskManifestKey(expected))
          throw new Error('The files changed after review. Prepare a new review before merging.');
      const applying: TaskReview = { ...review, phase: 'applying' };
      // Admit the exact checked journal before any file projection.
      assertTaskTurn(context);
      await taskStorage().beginTaskMerge(id, JSON.stringify(review));
      announceTasksChanged();
      return completeMerge(applying, main!, context);
    },
    context,
  );
}
async function completeMerge(
  review: TaskReview,
  main: Workspace,
  context?: TaskTurnContext,
): Promise<TaskReview> {
  const targetId = review.targetId ?? review.cruxId;
  const current = await captureTaskManifest(targetId);
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
  const db = taskStorage();
  await db.fileContent.finishProjection(targetId);
  if (taskManifestKey(await captureTaskManifest(targetId)) !== taskManifestKey(review.manifest))
    throw new Error(
      'The destination changed during the merge. The recovery journal has been kept.',
    );
  await db.completeTaskMerge(review.id);
  announceTasksChanged();
  if (context?.data === main.data) {
    // Reload only committed workspace state. loadCrux reconciles persisted
    // running jobs as interrupted, which is wrong inside their live turn.
    const crux = await getServices().crux.findById(main.id);
    const state = main.data.getState();
    main.data.setState({
      crux,
      messages: [
        ...state.messages.slice(0, state.messageSegmentStart),
        ...(crux.meta?.messages ?? []),
      ],
    });
    await main.data.getState().refreshArtifacts();
  } else await main.data.getState().loadCrux(main.id);
  await releaseTaskReviewCore(review.id);
  const taskWorkspace = getWorkspace(review.copyId);
  if (taskWorkspace) await taskWorkspace.data.getState().loadCrux(review.copyId);
  return loadTaskReview(review.id);
}

async function resumeTaskMergeCore(id: string, context?: TaskTurnContext): Promise<TaskReview> {
  taskStorage();
  const review = await loadTaskReview(id);
  if (review.phase === 'merged') return review;
  if (review.phase !== 'applying') throw new Error('There is no interrupted merge to recover.');
  return settled(
    [review.targetId ?? review.cruxId, review.copyId],
    async ([main]) => completeMerge(review, main!, context),
    context,
  );
}
export async function archiveTask(id: string, archived: boolean): Promise<void> {
  const db = taskStorage();
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
    await db.setWorkingCopyArchived(id, archived, prepared.revision);
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

/** Release the candidate's runtime resources; retained files remain recoverable. */
async function releaseTaskReviewCore(id: string): Promise<void> {
  const db = taskStorage();
  const review = await loadTaskReview(id);
  if (review.phase === 'applying') return;
  const { stopPreviewServer } = await import('./preview-server');
  const { stopDevServer } = await import('./site');
  await stopPreviewServer(review.candidateId);
  await stopDevServer(review.candidateId);
  await db.releaseTaskReview(id);
  announceTasksChanged();
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
export const applyTaskReview = (id: string, context?: TaskTurnContext) =>
  serializeCopy(`review:${id}`, () => applyTaskReviewCore(id, context));
export const resumeTaskMerge = (id: string, context?: TaskTurnContext) =>
  serializeCopy(`review:${id}`, () => resumeTaskMergeCore(id, context));
export const releaseTaskReview = (id: string) =>
  serializeCopy(`review:${id}`, () => releaseTaskReviewCore(id));

/** Retry an interrupted initial projection, refusing to overwrite unexpected work. */
export async function recoverTaskSetup(id: string): Promise<void> {
  taskStorage();
  await settled([id], async ([workspace]) => {
    const copy = await findWorkingCopy(id);
    if (!copy || copy.role !== 'task' || !['preparing', 'failed'].includes(copy.phase))
      throw new Error('This task does not need setup recovery.');
    const base = await startingTaskManifest(copy.id);
    let current: TaskManifest = {};
    const api = typeof window === 'undefined' ? undefined : window.electronAPI?.project;
    if (copy.projectFolder && (await api?.folderExists(copy.projectFolder)))
      current = await captureTaskManifest(id);
    for (const [path, file] of Object.entries(current))
      if (!sameTaskFile(file, base[path]))
        throw new Error(`Keep the unexpected changes at ${path} safe before recovering setup.`);
    await prepareTaskFolder(copy);
    await projectTaskManifest(id, current, base);
    await syncAgentsMd(await getServices().crux.findById(id), null);
    await finishOwnedTaskSetup(id, 'ready');
    const ready = await findWorkingCopy(id);
    if (ready?.projectFolder) await api?.watch(ready.projectFolder);
    await workspace!.data.getState().loadCrux(id);
    announceTasksChanged();
  });
}
