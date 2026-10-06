import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { trackWorkspaceOperation } from '@/stores/workspaceSelection';
import type { ChatMessage } from '@/api/types';
import { getServices } from './index';
import { runConversation } from '@/ai/engine';
import { createToolExecutor, subagentToolDefinitions } from '@/ai/tools';
import { buildContextFromData, buildPromptPartsFromData } from '@/ai/system-prompt';
import { getPersona, getPersonaFingerprint } from './persona';
import {
  createDelegatedTasks,
  prepareTaskReview,
  verifyTaskReview,
  applyTaskReview,
  loadTaskReview,
  releaseTaskReview,
  resumeTaskMerge,
  type TaskTurnContext,
  type TaskReview,
} from './tasks';
import {
  indexedTaskManifest,
  startingTaskManifest,
  captureTaskManifest,
  projectTaskManifest,
} from './task-files';
import { taskManifestKey, sameTaskFile } from './task-manifest';
import { getSqliteClient } from './sqlite/client';
import { findWorkingCopy } from './working-copies';
import type { DelegateContext } from './delegate';
import type { TurnJob } from './turn-jobs';
import {
  chosenApplies,
  conflictsDecided,
  describeMerge,
  newSubagentRun,
  partitionChanges,
  runSubagents,
  subagentActor,
  subagentPromptAddendum,
  subagentSummary,
  taskPrompt,
  withConflictChoice,
  type SubagentTask,
  type MergeState,
} from './subagents';

/** Operational workers share the ordinary Task review authority. */
export function createWorkingCopyDelegate(data: StoreApi<CruxState>) {
  const state = () => data.getState();
  let merging = false;
  function patch(id: string, update: (job: TurnJob) => TurnJob) {
    const job = state().turnJob;
    if (job?.id === id) state().setTurnJob(update(job));
  }
  const active = (context: TaskTurnContext) => {
    if (context.signal.aborted || state().closing || state().turnJob?.id !== context.jobId)
      throw new Error('The parent turn stopped. Worker Tasks remain available.');
  };
  async function completedReview(copyId: string): Promise<TaskReview | null> {
    const row = await getSqliteClient().get<{ data: string }>(
      "SELECT data FROM task_merges WHERE copy_id = ? AND phase = 'merged'",
      [copyId],
    );
    return row ? (JSON.parse(row.data) as TaskReview) : null;
  }
  function completedState(merge: MergeState, review: TaskReview): MergeState {
    const selected = new Map(
      [...merge.applied, ...chosenApplies(merge.conflicts)].map((change) => [change.path, change]),
    );
    return {
      ...merge,
      status: 'merged',
      reviewId: review.id,
      error: undefined,
      mergedAt: merge.mergedAt ?? new Date().toISOString(),
      applied: [...selected.values()].filter(
        (change) => !sameTaskFile(review.main[change.path], review.manifest[change.path]),
      ),
    };
  }
  async function mergeResult(context: TaskTurnContext) {
    active(context);
    const job = state().turnJob;
    if (!job?.merge?.resultCopyId || !job.subagents) return;
    let merge = job.merge;
    if (!conflictsDecided(merge.conflicts)) return;
    const save = async (next: MergeState) => {
      merge = next;
      patch(job.id, (j) => ({ ...j, merge: next }));
      await state().persistTurnState();
    };
    try {
      let review = merge.reviewId ? await loadTaskReview(merge.reviewId) : null;
      if (review?.phase === 'applying') {
        await save(completedState(merge, await resumeTaskMerge(review.id, context)));
        return;
      }
      if (
        review?.phase === 'merged' ||
        (await findWorkingCopy(merge.resultCopyId!))?.phase === 'merged'
      ) {
        const completed =
          review?.phase === 'merged' ? review : await completedReview(merge.resultCopyId!);
        if (!completed) throw new Error('The retained result journal is missing.');
        await save(completedState(merge, completed));
        return;
      }
      const desired = await startingTaskManifest(merge.resultCopyId!);
      const applies = [...merge.applied, ...chosenApplies(merge.conflicts)];
      const workerFiles = new Map<string, Awaited<ReturnType<typeof indexedTaskManifest>>>();
      for (const change of applies) {
        const worker = job.subagents[change.branch]?.branchId;
        if (!worker) throw new Error('A worker Task is missing.');
        if (change.kind === 'removed') delete desired[change.path];
        else {
          let manifest = workerFiles.get(worker);
          if (!manifest) {
            manifest = await indexedTaskManifest(worker);
            workerFiles.set(worker, manifest);
          }
          const file = manifest[change.path];
          if (!file) throw new Error(`The worker's ${change.path} is missing.`);
          desired[change.path] = file;
        }
      }
      const current = await captureTaskManifest(merge.resultCopyId!);
      const base = await startingTaskManifest(merge.resultCopyId!);
      if (
        taskManifestKey(current) !== taskManifestKey(base) &&
        taskManifestKey(current) !== taskManifestKey(desired)
      )
        throw new Error('The result Task has other edits. Open it to review those changes.');
      if (review?.phase === 'review') {
        // A completed parent turn may have added conversation since preparation.
        // Re-capture current target context through the shared review boundary.
        await releaseTaskReview(review.id);
        review = null;
      }
      active(context);
      await projectTaskManifest(merge.resultCopyId!, current, desired);
      review = await prepareTaskReview(merge.resultCopyId!, context);
      await save({ ...merge, reviewId: review.id, error: undefined });
      if (review.conflicts.length)
        throw new Error(
          'The source has conflicting edits. Open the result Task to review both versions.',
        );
      active(context);
      await verifyTaskReview(review.id);
      active(context);
      await save(completedState(merge, await applyTaskReview(review.id, context)));
    } catch (error) {
      await save({ ...merge, error: (error as Error).message });
    }
  }
  async function delegateTasks(tasks: SubagentTask[], ctx: DelegateContext): Promise<string> {
    if (state().crux?.id !== ctx.cruxId || state().turnJob?.id !== ctx.jobId)
      return 'Error: the parent workspace or turn is no longer available.';
    if (state().turnJob?.subagents?.length) return 'Error: this turn already delegated workers.';
    const context: TaskTurnContext = { data, jobId: ctx.jobId, signal: ctx.signal };
    try {
      active(context);
      const prepared = await createDelegatedTasks(context, [
        { title: 'Parallel work', prompt: 'Combined results from parallel workers.' },
        ...tasks.map((task) => ({ title: task.title, prompt: taskPrompt(task) })),
      ]);
      const resultCopy = prepared.copies[0];
      if (!resultCopy)
        throw new Error(prepared.errors[0] ?? 'The result Task could not be created.');
      const { artifact, crux } = getServices();
      const baseArtifacts = await artifact.findByResource('crux', resultCopy.id);
      const source = state().crux!;
      const fingerprint = getPersonaFingerprint(getPersona());
      const initial = tasks.map((task, index) => ({
        ...newSubagentRun(task),
        ...(prepared.copies[index + 1]
          ? { branchId: prepared.copies[index + 1]!.id }
          : {
              status: 'failed' as const,
              error: prepared.errors[index + 1],
              endedAt: new Date().toISOString(),
            }),
      }));
      patch(ctx.jobId, (job) => ({ ...job, subagents: initial }));
      await state().persistTurnState();
      const runs = await runSubagents(tasks, initial, {
        signal: ctx.signal,
        converse: (task, index, signal) => {
          const id = initial[index]!.branchId!;
          const execute = createToolExecutor(id, undefined, ctx.model, {
            requestedBy: subagentActor(task.title),
            scope: task.scope,
          });
          return runConversation(
            ctx.apiKey,
            id,
            [{ role: 'user', content: taskPrompt(task) }],
            ctx.model,
            (name, input) =>
              signal.aborted
                ? Promise.resolve('Error: the worker was stopped.')
                : execute(name, input),
            signal,
            {
              tools: subagentToolDefinitions(),
              systemPrompt:
                buildPromptPartsFromData(source, baseArtifacts).system +
                '\n\n' +
                subagentPromptAddendum(task, tasks.length),
              contextBlock: async () =>
                buildContextFromData(source, await artifact.findByResource('crux', id)),
            },
          );
        },
        update: async (runs) => {
          patch(ctx.jobId, (job) => ({ ...job, subagents: runs }));
          await state().persistTurnState();
        },
        finish: async (index, run, transcript) => {
          if (!run.branchId) return;
          const files = partitionChanges(baseArtifacts, [
            { branch: index, artifacts: await artifact.findByResource('crux', run.branchId) },
          ]).unique.map((change) => change.path);
          const messages: ChatMessage[] = [
            { role: 'user', content: taskPrompt(tasks[index]!), timestamp: run.startedAt },
            {
              role: 'assistant',
              content: transcript.content,
              agent: subagentActor(run.title),
              model: subagentActor(run.title),
              toolCalls: transcript.toolCalls,
              personaFingerprint: fingerprint,
              timestamp: new Date().toISOString(),
            },
          ];
          const copy = await crux.findById(run.branchId);
          await crux.update(run.branchId, { meta: { ...copy.meta, messages } });
          return { files };
        },
      });
      const messages: ChatMessage[] = runs.map((run) => ({
        role: 'assistant',
        content: subagentSummary(run),
        model: subagentActor(run.title),
        agent: subagentActor(run.title),
        personaFingerprint: fingerprint,
        timestamp: new Date().toISOString(),
      }));
      const result = await crux.findById(resultCopy.id);
      await crux.update(result.id, { meta: { ...result.meta, messages } });
      for (const message of messages) state().addMessage(message);
      const done = [];
      for (const [index, run] of runs.entries())
        if (run.status === 'done' && run.branchId)
          done.push({
            branch: index,
            artifacts: await artifact.findByResource('crux', run.branchId),
          });
      const partition = partitionChanges(baseArtifacts, done);
      const merge: MergeState | null =
        !ctx.signal.aborted && done.length
          ? {
              baseId: resultCopy.id,
              resultCopyId: resultCopy.id,
              status: 'pending',
              applied: partition.unique,
              conflicts: partition.conflicts,
            }
          : null;
      patch(ctx.jobId, (job) => ({ ...job, subagents: runs, ...(merge ? { merge } : {}) }));
      await state().saveMeta();
      await state().persistTurnState();
      if (merge && !merge.conflicts.length) await mergeResult(context);
      return describeMerge(runs, state().turnJob?.merge ?? null);
    } catch (error) {
      return `Error: ${(error as Error).message} Retained worker Tasks remain available.`;
    }
  }
  async function chooseConflict(path: string, choice: number | 'keep') {
    const job = state().turnJob;
    if (!job?.merge) return;
    if (job.merge.reviewId && (await loadTaskReview(job.merge.reviewId)).phase === 'applying')
      throw new Error('Resume the admitted merge before changing its choices.');
    patch(job.id, (j) => ({ ...j, merge: withConflictChoice(j.merge!, path, choice) }));
    await state().persistTurnState();
  }
  async function mergeNow() {
    const s = state();
    if (
      merging ||
      s.closing ||
      s.isStreaming ||
      ['planning', 'running', 'checking'].includes(s.turnJob?.status ?? '')
    )
      throw new Error('Wait for the current work to finish before merging.');
    if (!s.turnJob) return;
    merging = true;
    try {
      await mergeResult({ data, jobId: s.turnJob.id, signal: new AbortController().signal });
    } finally {
      merging = false;
    }
  }
  /** A result may be completed through the ordinary Task UI or agent controls. */
  async function refreshResult() {
    const idle = () =>
      !merging &&
      !state().closing &&
      !state().isStreaming &&
      !['planning', 'running', 'checking'].includes(state().turnJob?.status ?? '');
    const before = state(),
      job = before.turnJob;
    if (!idle() || !before.crux || !job?.merge?.resultCopyId || job.merge.status !== 'pending')
      return;
    await before.drain();
    const review = await completedReview(job.merge.resultCopyId);
    if (!review) return;
    const crux = await getServices().crux.findById(before.crux.id);
    if (!idle() || state().turnJob !== job || state().crux !== before.crux) return;
    data.setState({
      crux,
      messages: [
        ...before.messages.slice(0, before.messageSegmentStart),
        ...(crux.meta?.messages ?? []),
      ],
    });
    patch(job.id, (j) => ({
      ...j,
      merge: completedState(j.merge!, review),
    }));
    await state().persistTurnState();
  }
  return {
    delegateTasks,
    chooseConflict,
    mergeNow: trackWorkspaceOperation(data, mergeNow),
    refreshResult,
  };
}
