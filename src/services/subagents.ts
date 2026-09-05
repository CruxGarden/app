import type { Artifact, ToolCall } from '@/api/types';
import type { ConversationEvent } from '@/ai/engine';
import { didMutate } from '@/ai/tools';
import type { WriteScope } from '@/lib/write-scope';
import { describeScope } from '@/lib/write-scope';
import { pathOf } from '@/lib/artifact-path';
import { isGeneratedGuidePath } from './agents-md';
import { diffArtifactSets, type FileChange, type SnapshotDiff } from './growth';

/**
 * Subagents on Growth branches (AI-COLLABORATION-V3 B5, ADR 0013) — the pure
 * half: the run model that lives in the job, the merge algorithm, and the
 * bounded parallel runner over engine event streams. It knows nothing about
 * the store, the engine's construction or the Project Folder;
 * `services/delegate.ts` wires it to those.
 *
 * Shape of the work, honestly stated:
 * - each task gets a BRANCH: a snapshot crux cloned from the job's current tip
 *   that only the worker writes to (no Project Folder, so the disk is untouched
 *   until the merge) — it is in the Growth timeline as "Sub: <title>" from the
 *   start and stays there afterwards, restorable, as the audit trail;
 * - workers run in parallel up to a limit, each with a step and a time budget,
 *   and Stop on the parent job aborts all of them;
 * - the MERGE compares every finished branch with the base tip: a file only one
 *   branch touched applies to the main line; a file two or more touched
 *   differently is a conflict the person decides in the job card (take one
 *   branch, or leave the file as it is). Only branches that finished on their
 *   own merge — an interrupted or failed worker's partial files stay on its
 *   branch. One "Merged N subagents" snapshot closes the merge.
 */

export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 6;
/** Model rounds a worker may take before it is stopped. */
export const DEFAULT_STEP_BUDGET = 8;
/** Wall-clock budget per worker. */
export const DEFAULT_TIME_BUDGET_MS = 5 * 60_000;

export interface SubagentTask {
  title: string;
  /** Complete in itself — the worker does not see the main Collaboration. */
  instructions: string;
  scope: WriteScope;
}

export type SubagentStatus = 'pending' | 'running' | 'done' | 'failed' | 'interrupted';

/** One worker's state, as kept in the job (persisted with it). */
export interface SubagentRun {
  title: string;
  status: SubagentStatus;
  scope: WriteScope;
  /** The branch: a snapshot crux cloned from the base tip that this worker writes on. */
  branchId?: string;
  /** The Growth timeline entry for the branch. */
  growthId?: string;
  startedAt?: string;
  endedAt?: string;
  /** Model rounds taken so far. */
  steps: number;
  /** Paths changed on the branch (live from tool calls; exact after the diff at the end). */
  files: string[];
  error?: string;
  /** The worker's closing words. */
  reply?: string;
}

/** Attribution stamp for a worker's snapshots and messages: 'subagent:<title>'. */
export function subagentActor(title: string): string {
  return `subagent:${title}`;
}

export function newSubagentRun(task: SubagentTask): SubagentRun {
  return { title: task.title, status: 'pending', scope: task.scope, steps: 0, files: [] };
}

export function isSubagentActive(run: SubagentRun): boolean {
  return run.status === 'pending' || run.status === 'running';
}

// ── Merge ───────────────────────────────────────────────────────────────────

export type ChangeKind = 'added' | 'modified' | 'removed';

/** A file the merge applies to the main line, and which branch it comes from. */
export interface MergeApplied {
  path: string;
  /** Index into the job's subagents. */
  branch: number;
  kind: ChangeKind;
}

export interface ConflictOption {
  branch: number;
  kind: ChangeKind;
}

/** A file two or more branches changed differently — the person decides. */
export interface MergeConflict {
  path: string;
  options: ConflictOption[];
  /** The person's choice: a branch index, or 'keep' to leave the file as it is. */
  choice?: number | 'keep';
}

export interface MergeState {
  /** The snapshot crux every branch started from. */
  baseId: string;
  /** 'pending' while conflicts await a decision; 'merged' once the snapshot is taken. */
  status: 'pending' | 'merged';
  /** Files applied automatically (one branch each), then the chosen conflicts after Merge. */
  applied: MergeApplied[];
  conflicts: MergeConflict[];
  /** The "Merged N subagents" snapshot, once taken. */
  snapshotId?: string;
  mergedAt?: string;
}

export interface MergePartition {
  unique: MergeApplied[];
  conflicts: MergeConflict[];
}

interface Touch {
  branch: number;
  kind: ChangeKind;
  fingerprint: string | null;
}

function changesOf(diff: SnapshotDiff): { kind: ChangeKind; change: FileChange }[] {
  return [
    ...diff.added.map((change) => ({ kind: 'added' as const, change })),
    ...diff.modified.map((change) => ({ kind: 'modified' as const, change })),
    ...diff.removed.map((change) => ({ kind: 'removed' as const, change })),
  ];
}

/** App-managed files never merge: the generated guide, thumbnails, dir markers. */
export function isMergeInternal(path: string): boolean {
  return isGeneratedGuidePath(path) || path === '.keep' || path.endsWith('/.keep');
}

/**
 * Pure: partition every finished branch's changes against the base. A path one
 * branch touched — or several touched IDENTICALLY (same bytes, same kind) —
 * applies; a path touched differently by two or more is a conflict. Branch
 * indexes are whatever the caller passes (the job's subagent indexes).
 */
export function partitionChanges(
  base: Artifact[],
  branches: { branch: number; artifacts: Artifact[] }[],
): MergePartition {
  const touches = new Map<string, Touch[]>();
  for (const { branch, artifacts } of branches) {
    const byPath = new Map<string, Artifact>();
    for (const a of artifacts) if (a.type === 'artifact') byPath.set(pathOf(a), a);
    for (const { kind, change } of changesOf(diffArtifactSets(base, artifacts))) {
      if (isMergeInternal(change.path)) continue;
      const list = touches.get(change.path) ?? [];
      list.push({
        branch,
        kind,
        fingerprint: kind === 'removed' ? null : (byPath.get(change.path)?.fingerprint ?? null),
      });
      touches.set(change.path, list);
    }
  }

  const unique: MergeApplied[] = [];
  const conflicts: MergeConflict[] = [];
  for (const [path, list] of touches) {
    const first = list[0]!;
    const identical = list.every(
      (t) => t.kind === first.kind && t.fingerprint === first.fingerprint && t.fingerprint !== null,
    );
    if (list.length === 1 || identical) {
      unique.push({ path, branch: first.branch, kind: first.kind });
    } else {
      conflicts.push({
        path,
        options: list.map((t) => ({ branch: t.branch, kind: t.kind })),
      });
    }
  }
  const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);
  unique.sort(byPath);
  conflicts.sort(byPath);
  return { unique, conflicts };
}

/** Pure: the conflicts the person resolved with a branch — what Merge applies. */
export function chosenApplies(conflicts: MergeConflict[]): MergeApplied[] {
  const out: MergeApplied[] = [];
  for (const c of conflicts) {
    if (typeof c.choice !== 'number') continue;
    const option = c.options.find((o) => o.branch === c.choice);
    if (option) out.push({ path: c.path, branch: option.branch, kind: option.kind });
  }
  return out;
}

/** Every conflict has an answer (a branch or 'keep'). */
export function conflictsDecided(conflicts: MergeConflict[]): boolean {
  return conflicts.every((c) => c.choice !== undefined);
}

export function withConflictChoice(
  merge: MergeState,
  path: string,
  choice: number | 'keep',
): MergeState {
  return {
    ...merge,
    conflicts: merge.conflicts.map((c) => (c.path === path ? { ...c, choice } : c)),
  };
}

export const mergeLabel = (count: number): string =>
  `Merged ${count} subagent${count === 1 ? '' : 's'}`;

// ── Words ───────────────────────────────────────────────────────────────────

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The tool result the model reads back (and the card's summary line). */
export function describeMerge(runs: SubagentRun[], merge: MergeState | null): string {
  const lines: string[] = [];
  const done = runs.filter((r) => r.status === 'done');
  lines.push(
    `${plural(runs.length, 'worker')} ran in parallel: ${done.length} finished` +
      (runs.length !== done.length
        ? `, ${runs.length - done.length} did not (${runs
            .filter((r) => r.status !== 'done')
            .map((r) => `${r.title}: ${r.status}${r.error ? ` — ${r.error}` : ''}`)
            .join('; ')})`
        : '') +
      '.',
  );
  for (const r of runs) {
    lines.push(
      `- ${r.title} (${r.status}, ${plural(r.steps, 'round')}): ` +
        (r.files.length > 0 ? `changed ${r.files.join(', ')}` : 'changed no files') +
        (r.reply ? ` — ${r.reply.replace(/\s+/g, ' ').trim()}` : ''),
    );
  }
  if (!merge) {
    lines.push('Nothing was merged: no worker finished, so the main line is unchanged.');
    return lines.join('\n');
  }
  if (merge.applied.length > 0) {
    lines.push(
      `Merged ${plural(merge.applied.length, 'file')} onto the main line: ${merge.applied
        .map((a) => `${a.path} (${a.kind}, from ${runs[a.branch]?.title ?? `#${a.branch + 1}`})`)
        .join(', ')}.`,
    );
  } else {
    lines.push('No files merged automatically.');
  }
  if (merge.conflicts.length > 0) {
    if (merge.status === 'pending') {
      lines.push(
        `${plural(merge.conflicts.length, 'file')} need${merge.conflicts.length === 1 ? 's' : ''} a decision — changed by more than one worker: ${merge.conflicts
          .map(
            (c) =>
              `${c.path} (${c.options.map((o) => runs[o.branch]?.title ?? `#${o.branch + 1}`).join(' vs ')})`,
          )
          .join(', ')}. ` +
          'The person chooses which version to take in the job card; do not resolve these yourself and do not write those files now.',
      );
    } else {
      lines.push(
        `Decided by the person: ${merge.conflicts
          .map((c) =>
            c.choice === 'keep' || c.choice === undefined
              ? `${c.path} left as it was`
              : `${c.path} from ${runs[c.choice]?.title ?? `#${c.choice + 1}`}`,
          )
          .join(', ')}.`,
      );
    }
  }
  if (merge.status === 'merged') {
    lines.push(
      `Snapshot "${mergeLabel(runs.filter((r) => r.status === 'done').length)}" recorded.`,
    );
  }
  lines.push('Each worker\'s branch stays in Growth as "Sub: <title>".');
  return lines.join('\n');
}

/** The one compact message a worker leaves in the Collaboration. */
export function subagentSummary(run: SubagentRun): string {
  const head =
    run.status === 'done'
      ? run.files.length > 0
        ? `Changed ${plural(run.files.length, 'file')}: ${run.files.join(', ')}.`
        : 'Finished without changing any files.'
      : run.status === 'interrupted'
        ? `Stopped before finishing${run.files.length ? ` — ${plural(run.files.length, 'file')} on the branch: ${run.files.join(', ')}` : ''}.`
        : `Did not finish${run.error ? ` — ${run.error}` : ''}${run.files.length ? `; ${plural(run.files.length, 'file')} on the branch: ${run.files.join(', ')}` : ''}.`;
  return run.reply ? `${head}\n\n${run.reply.trim()}` : head;
}

/** The task as the worker reads it — its whole brief. */
export function taskPrompt(task: SubagentTask): string {
  return [
    `[Subagent] ${task.title}`,
    '',
    task.instructions.trim(),
    '',
    `Scope: you may change ${describeScope(task.scope)}. Writes anywhere else are refused.`,
    'Do the work with the tools, then reply with one or two sentences saying what you changed. Do not ask questions.',
  ].join('\n');
}

/** Appended to the main crux's stable prompt for a worker. */
export function subagentPromptAddendum(task: SubagentTask, count: number): string {
  return (
    '## Working in parallel\n' +
    `You are one of ${count} workers, each on its own Growth branch, all started from the same files. Your task is "${task.title}". ` +
    `You may only change ${describeScope(task.scope)} — the tools refuse anything else; other workers own the other files, so do not try. ` +
    'Nobody answers questions here: if something is impossible, say so in your reply and stop. ' +
    'Skip plans and checks — do the work, then say in one or two sentences what you changed.'
  );
}

// ── Runner ──────────────────────────────────────────────────────────────────

export interface SubagentTranscript {
  /** The worker's own assistant text, all rounds. */
  content: string;
  toolCalls: ToolCall[];
}

export interface SubagentRunnerDeps {
  /** The worker's conversation on its branch. */
  converse: (
    task: SubagentTask,
    index: number,
    signal: AbortSignal,
  ) => AsyncIterable<ConversationEvent>;
  /** Every state change (the wiring publishes and persists). */
  update: (runs: SubagentRun[]) => void | Promise<void>;
  /**
   * A worker's conversation is over (any status) — record the branch. May
   * return a patch (the exact files from the branch diff, for instance).
   */
  finish?: (
    index: number,
    run: SubagentRun,
    transcript: SubagentTranscript,
  ) => Promise<Partial<SubagentRun> | void>;
  /** The parent job's signal: Stop aborts every worker. */
  signal?: AbortSignal;
  concurrency?: number;
  stepBudget?: number;
  timeBudgetMs?: number;
  now?: () => Date;
}

/** Run `tasks` in parallel (bounded), reporting through `runs`. Resolves when all have ended. */
export async function runSubagents(
  tasks: SubagentTask[],
  initial: SubagentRun[],
  deps: SubagentRunnerDeps,
): Promise<SubagentRun[]> {
  const runs = initial.map((r) => ({ ...r }));
  const limit = Math.max(1, Math.min(deps.concurrency ?? DEFAULT_CONCURRENCY, MAX_CONCURRENCY));
  const stepBudget = deps.stepBudget ?? DEFAULT_STEP_BUDGET;
  const timeBudgetMs = deps.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const now = deps.now ?? (() => new Date());

  const publish = async (index: number, patch: Partial<SubagentRun>) => {
    runs[index] = { ...runs[index]!, ...patch };
    await deps.update(runs.map((r) => ({ ...r })));
  };

  async function runOne(index: number): Promise<void> {
    const task = tasks[index]!;
    if (deps.signal?.aborted) {
      await publish(index, { status: 'interrupted', endedAt: now().toISOString() });
      return;
    }
    const child = new AbortController();
    let budgetError: string | null = null;
    const onParentAbort = () => child.abort();
    deps.signal?.addEventListener('abort', onParentAbort, { once: true });
    const timer = setTimeout(() => {
      budgetError = `Ran out of time (${Math.round(timeBudgetMs / 60_000)} min budget)`;
      child.abort();
    }, timeBudgetMs);

    let content = '';
    const toolCalls: ToolCall[] = [];
    const files = new Set<string>(runs[index]!.files);
    let steps = 0;
    let sawError = false;
    await publish(index, { status: 'running', startedAt: now().toISOString() });

    try {
      for await (const event of deps.converse(task, index, child.signal)) {
        switch (event.type) {
          case 'text':
            content += event.content;
            break;
          case 'tool_start':
            toolCalls.push({
              id: event.id,
              name: event.name,
              input: event.input,
              result: undefined,
            });
            break;
          case 'tool_result': {
            const tc = toolCalls.find((t) => t.id === event.id);
            if (tc) tc.result = event.result;
            if (didMutate(event.name, event.result)) {
              const p =
                event.name === 'rename_file' ? undefined : (tc?.input.path as string | undefined);
              if (p) files.add(p.replace(/^\//, ''));
              await publish(index, { files: [...files] });
            }
            break;
          }
          case 'step_end':
            steps++;
            await publish(index, { steps });
            if (steps >= stepBudget) {
              budgetError = `Reached the step budget (${stepBudget} rounds)`;
              child.abort();
            }
            break;
          case 'error':
            sawError = true;
            content += `\n\n*Error: ${event.message}*`;
            break;
          case 'info':
          case 'usage':
          case 'done':
            break;
        }
        if (child.signal.aborted) break;
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e?.name !== 'AbortError' && !child.signal.aborted) {
        sawError = true;
        content += `\n\n*Error: ${e?.message ?? String(err)}*`;
      }
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener('abort', onParentAbort);
    }

    const parentStopped = !!deps.signal?.aborted;
    const status: SubagentStatus = parentStopped
      ? 'interrupted'
      : budgetError || sawError
        ? 'failed'
        : 'done';
    const reply = content.trim();
    const patch: Partial<SubagentRun> = {
      status,
      steps,
      files: [...files],
      endedAt: now().toISOString(),
      ...(reply ? { reply: reply.slice(0, 600) } : {}),
      ...(budgetError
        ? { error: budgetError }
        : sawError
          ? { error: 'The worker hit an error' }
          : {}),
    };
    runs[index] = { ...runs[index]!, ...patch };
    let finished: Partial<SubagentRun> = {};
    if (deps.finish) {
      try {
        finished = (await deps.finish(index, runs[index]!, { content, toolCalls })) ?? {};
      } catch (err) {
        console.warn(`[subagents] finishing "${task.title}" failed:`, err);
      }
    }
    await publish(index, finished);
  }

  // A small pool: `limit` workers pull the next index until none are left.
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      await runOne(index);
    }
  });
  await Promise.all(workers);
  return runs;
}
