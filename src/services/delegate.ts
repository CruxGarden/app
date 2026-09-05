import { useCruxStore } from '@/stores/cruxStore';
import { getServices } from '@/services';
import { runConversation } from '@/ai/engine';
import { createToolExecutor, subagentToolDefinitions } from '@/ai/tools';
import { buildContextFromData, buildPromptPartsFromData } from '@/ai/system-prompt';
import { isBinaryMime } from '@/lib/mime';
import { pathOf } from '@/lib/artifact-path';
import type { Artifact, ChatMessage, Crux } from '@/api/types';
import { getPersona, getPersonaFingerprint } from './persona';
import { playCue } from './cues';
import type { TurnJob } from './turn-jobs';
import {
  chosenApplies,
  conflictsDecided,
  describeMerge,
  mergeLabel,
  newSubagentRun,
  partitionChanges,
  runSubagents,
  subagentActor,
  subagentPromptAddendum,
  subagentSummary,
  taskPrompt,
  withConflictChoice,
  type MergeApplied,
  type MergeState,
  type SubagentRun,
  type SubagentTask,
} from './subagents';

/**
 * Subagents — the wiring (B5). `runSubagents` (pure) is driven here against
 * the open workspace: branches are snapshot cruxes cloned from the job's tip
 * (no Project Folder, so nothing touches disk until the merge), each worker
 * gets a scoped executor bound to its branch and a conversation built from the
 * MAIN crux's guidance over the BRANCH's files, and the merge applies files to
 * the main line and takes the "Merged N subagents" snapshot.
 *
 * Two callers: the `delegate` tool (through `services/turns.ts`, which hands
 * in the running job) and the Builder's batch actions (a job of their own).
 * Both end in `delegateTasks`; `chooseConflict` / `mergeNow` are the person's
 * buttons on the job card.
 */

export interface DelegateContext {
  cruxId: string;
  model: string;
  apiKey: string;
  /** The parent job's signal — Stop aborts every worker. */
  signal: AbortSignal;
  /** The job the workers belong to. */
  jobId: string;
  /** Who asked for the fan-out — recorded on the snapshots it takes. */
  requestedBy?: string;
}

/** The label of the snapshot every branch starts from. */
export const BASE_LABEL = 'Before parallel work';

const store = () => useCruxStore.getState();

/** Update the live job in place (the turn loop carries this state forward — see withLiveParallelState). */
function patchJob(jobId: string, fn: (job: TurnJob) => TurnJob): TurnJob | null {
  const live = store().turnJob;
  if (!live || live.id !== jobId) return null;
  const next = fn(live);
  store().setTurnJob(next);
  return next;
}

/** The snapshot crux the main line currently sits on. */
function mainTipId(): string | null {
  const s = store();
  const active = s.crux?.meta?.settings?.activeBranch as string | undefined;
  if (active) return active;
  const latest = s.growths[s.growths.length - 1];
  return latest?.targetId ?? null;
}

/**
 * Fan `tasks` out to workers on Growth branches, merge what finished, and
 * return the summary (the `delegate` tool result). Never throws — every
 * failure is a sentence the model and the person can read.
 */
export async function delegateTasks(tasks: SubagentTask[], ctx: DelegateContext): Promise<string> {
  const { cruxId, model, apiKey, signal, jobId } = ctx;
  const stillHere = () => store().crux?.id === cruxId;
  if (!stillHere()) return 'Error: the crux is no longer open; nothing was delegated.';
  const liveJob = store().turnJob;
  if (!liveJob || liveJob.id !== jobId) return 'Error: no running job to attach the workers to.';
  if (liveJob.subagents?.length) {
    return 'Error: this turn already ran parallel workers. Finish the turn; you can delegate again on the next one.';
  }
  if (signal.aborted) return 'Error: the turn was stopped before the workers started.';

  const { crux: cruxService, artifact, dimension } = getServices();
  const requestedBy = ctx.requestedBy ?? 'collaborator';
  const pf = getPersonaFingerprint(getPersona());

  // 1. The base: the main line's tip, capturing any uncaptured change first.
  try {
    await store().createSnapshot({ label: BASE_LABEL, silent: true, ifChanged: true, requestedBy });
  } catch (err) {
    return `Error: could not snapshot the current state before fanning out (${(err as Error).message}). Nothing was delegated.`;
  }
  if (!stillHere()) return 'Error: the crux was closed; nothing was delegated.';
  const baseId = mainTipId();
  if (!baseId) return 'Error: there is no snapshot to branch from; nothing was delegated.';
  // Later main-line snapshots (the merge, the end of the turn) must chain from
  // the base, not from whichever "Sub:" branch was recorded last.
  store().patchCruxMeta({
    settings: { ...(store().crux?.meta?.settings ?? {}), activeBranch: baseId },
  });

  const mainCrux = store().crux as Crux;
  const baseArtifacts = await artifact.findByResource('crux', baseId);

  // 2. One branch per task, recorded in the timeline before any work starts.
  const runs: SubagentRun[] = [];
  for (const [i, task] of tasks.entries()) {
    const label = `Sub: ${task.title}`;
    try {
      const branch = await cruxService.create({
        slug: `sub-${i + 1}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title: label,
        type: 'crux',
        kind: 'snapshot',
        meta: {
          messages: [],
          parentCruxId: baseId,
          subagent: { jobId, title: task.title, scope: task.scope },
        },
      });
      await artifact.cloneArtifactsToSnapshot(baseId, branch.id);
      const growth = await dimension.create({
        sourceId: cruxId,
        targetId: branch.id,
        type: 'growth',
        weight: store().growthCount + 1,
        meta: {
          label,
          requestedBy: subagentActor(task.title),
          subagent: { jobId, task: i },
          artifactCount: baseArtifacts.filter((a) => a.type === 'artifact').length,
        },
      });
      store().addGrowth(growth);
      runs.push({ ...newSubagentRun(task), branchId: branch.id, growthId: growth.id });
    } catch (err) {
      runs.push({
        ...newSubagentRun(task),
        status: 'failed',
        error: `Could not create the branch: ${(err as Error).message}`,
        endedAt: new Date().toISOString(),
      });
    }
  }
  patchJob(jobId, (job) => ({ ...job, subagents: runs }));
  await store().saveMeta(); // growthCount + activeBranch
  await store().persistTurnState();

  // 3. Run them.
  let lastStatuses = runs.map((r) => r.status).join(',');
  const finalRuns = await runSubagents(tasks, runs, {
    signal,
    converse: (task, i, childSignal) => {
      const branchId = runs[i]!.branchId;
      if (!branchId) return failedStream('The branch could not be created.');
      const exec = createToolExecutor(branchId, undefined, model, {
        requestedBy: subagentActor(task.title),
        scope: task.scope,
      });
      // Stop means stop, for workers too.
      const guarded: typeof exec = async (name, input) =>
        childSignal.aborted ? 'Error: the worker was stopped before this ran.' : exec(name, input);
      const system =
        buildPromptPartsFromData(mainCrux, baseArtifacts).system +
        '\n\n' +
        subagentPromptAddendum(task, tasks.length);
      return runConversation(
        apiKey,
        branchId,
        [{ role: 'user', content: taskPrompt(task) }],
        model,
        guarded,
        childSignal,
        {
          tools: subagentToolDefinitions(),
          systemPrompt: system,
          contextBlock: async () =>
            buildContextFromData(mainCrux, await artifact.findByResource('crux', branchId)),
        },
      );
    },
    update: async (next) => {
      if (!stillHere()) return;
      patchJob(jobId, (job) => ({ ...job, subagents: next }));
      const statuses = next.map((r) => r.status).join(',');
      if (statuses !== lastStatuses) {
        lastStatuses = statuses;
        await store().persistTurnState();
      }
    },
    finish: async (i, run, transcript) => {
      if (!run.branchId) return;
      // The branch is its own record: exact files vs the base, its
      // fingerprint, and the worker's transcript as the snapshot's segment.
      const branchArtifacts = await artifact.findByResource('crux', run.branchId);
      const files = changedPaths(baseArtifacts, branchArtifacts);
      const fingerprint = await artifact.computeSnapshotFingerprint(run.branchId);
      const branch = await cruxService.findById(run.branchId);
      const actor = subagentActor(run.title);
      const messages: ChatMessage[] = [
        { role: 'user', content: taskPrompt(tasks[i]!), timestamp: run.startedAt },
        {
          role: 'assistant',
          content: transcript.content,
          model: actor,
          agent: actor,
          timestamp: new Date().toISOString(),
          toolCalls: transcript.toolCalls.length > 0 ? transcript.toolCalls : undefined,
          personaFingerprint: pf,
        },
      ];
      await cruxService.update(run.branchId, {
        meta: { ...(branch.meta ?? {}), fingerprint, messages },
      });
      return { files };
    },
  });

  if (!stillHere())
    return 'The crux was closed while the workers ran; their branches are in Growth.';

  // 4. Merge what finished — unless the person stopped everything.
  let merge: MergeState | null = null;
  const done = finalRuns
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.status === 'done' && r.branchId);
  if (!signal.aborted && done.length > 0) {
    const branchArtifacts = new Map<number, Artifact[]>();
    for (const { r, i } of done) {
      branchArtifacts.set(i, await artifact.findByResource('crux', r.branchId!));
    }
    const partition = partitionChanges(
      baseArtifacts,
      done.map(({ i }) => ({ branch: i, artifacts: branchArtifacts.get(i)! })),
    );
    for (const a of partition.unique) {
      await applyToMainLine(cruxId, branchArtifacts.get(a.branch)!, a);
    }
    await store().refreshArtifacts();
    merge = {
      baseId,
      status: partition.conflicts.length > 0 ? 'pending' : 'merged',
      applied: partition.unique,
      conflicts: partition.conflicts,
    };
    if (merge.status === 'merged') {
      merge = await takeMergeSnapshot(merge, done.length, requestedBy);
    }
  }

  // 5. The Collaboration gets one compact line per worker, in the worker's name.
  for (const run of finalRuns) {
    const actor = subagentActor(run.title);
    store().addMessage({
      role: 'assistant',
      content: subagentSummary(run),
      model: actor,
      agent: actor,
      timestamp: new Date().toISOString(),
      personaFingerprint: pf,
    });
  }
  patchJob(jobId, (job) => ({ ...job, subagents: finalRuns, ...(merge ? { merge } : {}) }));
  await store().saveMeta();
  await store().persistTurnState();
  void playCue(merge?.status === 'merged' ? 'snapshot' : 'toolDone');
  return describeMerge(finalRuns, merge);
}

/** A worker whose branch never existed: one error event and out. */
async function* failedStream(message: string) {
  yield { type: 'error' as const, message };
}

function changedPaths(base: Artifact[], branch: Artifact[]): string[] {
  const p = partitionChanges(base, [{ branch: 0, artifacts: branch }]);
  return [...p.unique.map((u) => u.path), ...p.conflicts.map((c) => c.path)].sort();
}

/** Copy one change from a branch onto the main line (content round-trip; blobs dedupe by fingerprint). */
async function applyToMainLine(
  cruxId: string,
  branchArtifacts: Artifact[],
  change: MergeApplied,
): Promise<void> {
  const { artifact } = getServices();
  if (change.kind === 'removed') {
    const main = (await artifact.findByResource('crux', cruxId)).find(
      (a) => a.type === 'artifact' && pathOf(a) === change.path,
    );
    if (main) await artifact.delete(main.id);
    return;
  }
  const src = branchArtifacts.find((a) => a.type === 'artifact' && pathOf(a) === change.path);
  if (!src) return;
  if (src.encoding === 'binary' || isBinaryMime(src.mimeType || '')) {
    const blob = await artifact.downloadBlob(src.id);
    await artifact.upload({
      resourceId: cruxId,
      resourceType: 'crux',
      blob,
      mimeType: src.mimeType,
      meta: { path: change.path },
    });
  } else {
    const content = await artifact.readContent(src.id);
    await artifact.create({
      resourceId: cruxId,
      resourceType: 'crux',
      content,
      mimeType: src.mimeType,
      meta: { path: change.path },
    });
  }
}

async function takeMergeSnapshot(
  merge: MergeState,
  mergedCount: number,
  requestedBy: string,
): Promise<MergeState> {
  const before = store().growths.length;
  try {
    await store().createSnapshot({ label: mergeLabel(mergedCount), silent: true, requestedBy });
  } catch (err) {
    console.warn('[delegate] merge snapshot failed:', err);
  }
  const growths = store().growths;
  const snapshotId = growths.length > before ? growths[growths.length - 1]!.targetId : undefined;
  return {
    ...merge,
    status: 'merged',
    mergedAt: new Date().toISOString(),
    ...(snapshotId ? { snapshotId } : {}),
  };
}

// ── The person's buttons ────────────────────────────────────────────────────

/** Pick a version for one conflicting file (a branch index, or 'keep'). */
export async function chooseConflict(path: string, choice: number | 'keep'): Promise<void> {
  const job = store().turnJob;
  if (!job?.merge) return;
  patchJob(job.id, (j) => ({ ...j, merge: withConflictChoice(j.merge!, path, choice) }));
  await store().persistTurnState();
}

/** Apply the decided conflicts to the main line and take the merge snapshot. */
export async function mergeNow(): Promise<void> {
  const s = store();
  const job = s.turnJob;
  if (!s.crux || !job?.merge || job.merge.status !== 'pending' || !job.subagents) return;
  if (!conflictsDecided(job.merge.conflicts)) return;
  const cruxId = s.crux.id;
  const { artifact } = getServices();
  const applies = chosenApplies(job.merge.conflicts);
  for (const a of applies) {
    const branchId = job.subagents[a.branch]?.branchId;
    if (!branchId) continue;
    await applyToMainLine(cruxId, await artifact.findByResource('crux', branchId), a);
  }
  await s.refreshArtifacts();
  const mergedCount = job.subagents.filter((r) => r.status === 'done').length;
  const merged = await takeMergeSnapshot(
    { ...job.merge, applied: [...job.merge.applied, ...applies] },
    mergedCount,
    'person',
  );
  patchJob(job.id, (j) => ({ ...j, merge: merged }));
  await store().saveMeta();
  await store().persistTurnState();
  void playCue('snapshot');
}
