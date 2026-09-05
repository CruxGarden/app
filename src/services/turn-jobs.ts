import type { ChatMessage, ToolCall, TurnCheckSummary, TurnJobSummary } from '@/api/types';
import type { ConversationEvent } from '@/ai/engine';
import { didMutate } from '@/ai/tools';

/**
 * Background Turns (AI-COLLABORATION-V3 B3, ADR 0013).
 *
 * A collaborator turn is a JOB the store tracks, not a promise a hook awaits:
 * it has a plan (the model emits it first), step progress, an interrupt, and
 * a Growth snapshot per step. This module is the pure half — the job model,
 * plan parsing, and the event loop that turns engine events into job state.
 * It knows nothing about React or the store; `services/turns.ts` wires it to
 * both and owns queue/steer/stop.
 *
 * Step boundaries are honest, not clever: a step is DONE when a snapshot
 * lands after a file-mutating model round (or when the model calls the
 * `snapshot` tool). Steps are display and interrupt granularity, not control
 * flow — the model is never blocked on them.
 */

export type TurnJobStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'paused'
  /** Verify before done (B4): build, screenshot, and inspect the result. */
  | 'checking'
  | 'done'
  | 'failed'
  | 'interrupted';

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'interrupted';

export interface PlanStep {
  title: string;
  status: PlanStepStatus;
  /** Growth snapshot (snapshot crux id) taken when this step completed. */
  snapshotId?: string;
}

export interface TurnPlan {
  steps: PlanStep[];
  /** True when the model emitted a ```plan block; false for the implicit single step. */
  explicit: boolean;
}

export type TurnStopReason = 'stopped' | 'steered' | 'closed';

export type TurnCheckStatus = 'checking' | 'passed' | 'problems';

/** One screenshot the check took, and whether the verdict on it was ok. */
export interface CheckShot {
  fingerprint: string;
  ok: boolean;
}

/**
 * Verify before done (AI-COLLABORATION-V3 B4). A check runs on a "done" claim
 * (or when the person presses "Check it"): build for Site Cruxes, screenshot
 * the preview, one bounded inspection turn. A failing first check reopens the
 * job for ONE fix turn and re-checks once; the second verdict is final.
 */
export interface TurnCheck {
  status: TurnCheckStatus;
  /** 1 for the first check, 2 for the re-check after the fix turn. Never more. */
  attempt: number;
  /** What the check found (empty when it passed). Readable in the card and transcript. */
  problems: string[];
  /** Screenshots in order — the failed "before" shot first, the final shot last. */
  shots: CheckShot[];
  /** Growth snapshot the latest verdict was recorded on. */
  snapshotId?: string;
  /** Why the inspection was partial (no vision, no preview, verdict unreadable). */
  note?: string;
  /** Who asked: the model's completion claim, or the person ("Check it"). */
  requestedBy: 'claim' | 'person';
}

export interface TurnJob {
  id: string;
  cruxId: string;
  status: TurnJobStatus;
  plan: TurnPlan;
  /** Index into plan.steps of the step in progress (or last touched). */
  currentStep: number;
  startedAt: string;
  endedAt?: string;
  error?: string;
  /** Why the job ended early, when it did. */
  stopReason?: TurnStopReason;
  /** Snapshot crux ids this job took, in order (the last one is what Restore offers). */
  snapshotIds: string[];
  /** Short preview of the message that started the job — display only. */
  prompt: string;
  /** Verify-before-done state, once a check started on this job (B4). */
  check?: TurnCheck;
}

export type { TurnJobSummary };

/**
 * The line B0/B1 splice into the system prompt so the model emits a plan
 * before acting. The fence is the whole convention — no tool, no schema.
 */
export const PLAN_PROMPT_LINE =
  'For any task that takes more than one file change, begin your reply with a short plan in a ```plan fenced block — one numbered line per step, no prose inside the fence — then carry it out. Skip the plan for one-line answers and single edits.';

export const MAX_PLAN_STEPS = 12;
const PROMPT_PREVIEW_LENGTH = 72;

const PLAN_FENCE_OPEN = /```plan[^\n]*\n/;
const PLAN_FENCE = /```plan[^\n]*\n([\s\S]*?)```/;

/** Parse the first ```plan block in `text` into step titles; null when absent or empty. */
export function parsePlan(text: string): string[] | null {
  const m = PLAN_FENCE.exec(text);
  if (!m) return null;
  const titles = m[1]!
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter(Boolean);
  return titles.length > 0 ? titles.slice(0, MAX_PLAN_STEPS) : null;
}

/** True once a ```plan fence has opened but not yet closed — parsing must wait. */
export function hasOpenPlanFence(text: string): boolean {
  return PLAN_FENCE_OPEN.test(text) && !PLAN_FENCE.test(text);
}

export function promptPreview(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > PROMPT_PREVIEW_LENGTH
    ? `${oneLine.slice(0, PROMPT_PREVIEW_LENGTH - 1)}…`
    : oneLine;
}

export function isJobActive(job: TurnJob | null | undefined): boolean {
  return (
    !!job &&
    (job.status === 'planning' ||
      job.status === 'running' ||
      job.status === 'queued' ||
      job.status === 'checking')
  );
}

/** The fix turn after a failed first check is running (or about to). */
export function isFixingAfterCheck(job: TurnJob | null | undefined): boolean {
  return (
    !!job &&
    !!job.check &&
    job.check.status === 'problems' &&
    job.check.attempt === 1 &&
    (job.status === 'running' || job.status === 'planning')
  );
}

export function newTurnJob(cruxId: string, content: string, now = new Date()): TurnJob {
  return {
    id: `job-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    cruxId,
    status: 'planning',
    plan: { steps: [{ title: promptPreview(content), status: 'running' }], explicit: false },
    currentStep: 0,
    startedAt: now.toISOString(),
    snapshotIds: [],
    prompt: promptPreview(content),
  };
}

/** Growth label for a step snapshot: "Step 2: Add the header". */
export function stepLabel(job: TurnJob, stepIndex: number): string {
  const step = job.plan.steps[stepIndex];
  const title = step?.title ?? job.prompt;
  return job.plan.explicit ? `Step ${stepIndex + 1}: ${title}` : title;
}

export function summarizeJob(job: TurnJob): TurnJobSummary {
  const status: TurnJobSummary['status'] =
    job.status === 'failed' ? 'failed' : job.status === 'interrupted' ? 'interrupted' : 'done';
  const check = summarizeCheck(job.check);
  return {
    status,
    steps: job.plan.steps.length,
    completedSteps: job.plan.steps.filter((s) => s.status === 'done').length,
    snapshots: job.snapshotIds.length,
    ...(check ? { check } : {}),
  };
}

/** The transcript's view of a finished check; null while it runs or never ran. */
export function summarizeCheck(check: TurnCheck | undefined): TurnCheckSummary | null {
  if (!check || check.status === 'checking') return null;
  const last = check.shots.at(-1);
  return {
    status: check.status,
    problems: check.problems,
    ...(last ? { thumbnailFingerprint: last.fingerprint } : {}),
  };
}

/** The one-line label for a check outcome — the only words the UI uses for it. */
export function describeCheck(status: TurnCheckStatus): string {
  switch (status) {
    case 'checking':
      return 'Checking…';
    case 'passed':
      return 'Checked ✓';
    case 'problems':
      return 'Check found problems';
  }
}

/** The transcript line under a finished job's reply: "Ran 3 steps · 2 snapshots". */
export function describeJobSummary(s: TurnJobSummary): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const snaps = plural(s.snapshots, 'snapshot');
  if (s.status === 'done') return `Ran ${plural(s.steps, 'step')} · ${snaps}`;
  const head = s.status === 'failed' ? 'Failed' : 'Stopped';
  return `${head} after ${s.completedSteps} of ${plural(s.steps, 'step')} · ${snaps}`;
}

/**
 * A job that was still active in persisted state can only mean the app closed
 * under it — report it as interrupted rather than pretending it is running.
 */
export function reconcilePersistedJob(job: TurnJob | null | undefined): TurnJob | null {
  if (!job) return null;
  if (!isJobActive(job) && job.status !== 'paused') return job;
  return finishJob(job, 'interrupted', {
    stopReason: 'closed',
    error: 'The app closed while this was running.',
  });
}

// ── Verify before done (B4) ─────────────────────────────────────────────────

/**
 * The completion-claim heuristic, deliberately simple: a turn reads as "done"
 * when the model emitted a plan (it set out to finish something) OR its final
 * text contains one of these words. False positives cost one check; false
 * negatives are covered by the "Check it" button.
 */
export const COMPLETION_CLAIM = /\b(done|finished|complete|completed|ready|should (?:now )?work|that's it|all set)\b/i;

export function looksLikeCompletionClaim(text: string): boolean {
  return COMPLETION_CLAIM.test(text);
}

/**
 * Should the automatic check run after this job? All of: the setting is on,
 * the crux is visual (Site Crux or index.html), the turn changed files, the
 * job finished on its own, no check ran yet, and it reads as a completion.
 */
export function shouldAutoCheck(args: {
  job: TurnJob;
  content: string;
  mutated: boolean;
  visual: boolean;
  enabled: boolean;
}): boolean {
  const { job, content, mutated, visual, enabled } = args;
  if (!enabled || !visual || !mutated) return false;
  if (job.status !== 'done' || job.check) return false;
  return job.plan.explicit || looksLikeCompletionClaim(content);
}

/** A job with only a check to run — the person pressed "Check it". */
export function newCheckJob(cruxId: string, now = new Date()): TurnJob {
  const job = newTurnJob(cruxId, 'Check it', now);
  return beginCheck(job, 'person');
}

/** Move the job into its check (first or second attempt). */
export function beginCheck(job: TurnJob, requestedBy: TurnCheck['requestedBy']): TurnJob {
  const prev = job.check;
  return {
    ...job,
    status: 'checking',
    check: {
      status: 'checking',
      attempt: (prev?.attempt ?? 0) + 1,
      problems: [],
      shots: prev?.shots ?? [],
      requestedBy: prev?.requestedBy ?? requestedBy,
      ...(prev?.snapshotId ? { snapshotId: prev.snapshotId } : {}),
    },
  };
}

export interface CheckVerdictRecord {
  ok: boolean;
  problems: string[];
  /** Fingerprint of the screenshot this verdict was made on, if one was taken. */
  shotFingerprint?: string;
  note?: string;
}

/** Record a verdict on the job's check. The job is `done` afterwards (the loop is over). */
export function finishCheck(job: TurnJob, verdict: CheckVerdictRecord): TurnJob {
  const check = job.check ?? {
    status: 'checking',
    attempt: 1,
    problems: [],
    shots: [],
    requestedBy: 'claim' as const,
  };
  const shots = verdict.shotFingerprint
    ? [...check.shots, { fingerprint: verdict.shotFingerprint, ok: verdict.ok }]
    : check.shots;
  const finished = finishJob(job, 'done');
  return {
    ...finished,
    check: {
      ...check,
      status: verdict.ok ? 'passed' : 'problems',
      problems: verdict.problems,
      shots,
      ...(verdict.note ? { note: verdict.note } : {}),
    },
  };
}

/**
 * Reopen a job whose first check found problems for ONE fix turn: same job id
 * and snapshots, a fresh implicit step named for the fix. The check keeps its
 * problems so the card can say what is being fixed.
 */
export function continueJobForFix(job: TurnJob, problems: string[]): TurnJob {
  const title = `Fix: ${promptPreview(problems.join('; '))}`;
  const { endedAt: _endedAt, stopReason: _stopReason, error: _error, ...rest } = job;
  return {
    ...rest,
    status: 'running',
    plan: { steps: [{ title, status: 'running' }], explicit: false },
    currentStep: 0,
    check: {
      ...(job.check ?? { attempt: 1, shots: [], requestedBy: 'claim' as const }),
      status: 'problems',
      problems,
    },
  };
}

/** Attach the verdict to the Growth snapshot it was recorded on. */
export function withCheckSnapshot(job: TurnJob, snapshotId: string): TurnJob {
  if (!job.check) return job;
  return { ...job, check: { ...job.check, snapshotId } };
}

/** The Growth dimension meta entry a verified snapshot carries. */
export interface SnapshotVerification {
  status: 'passed' | 'problems';
  problems: string[];
  attempt: number;
  requestedBy: TurnCheck['requestedBy'];
  checkedAt: string;
}

export function verificationOf(job: TurnJob, now = new Date()): SnapshotVerification | null {
  const c = job.check;
  if (!c || c.status === 'checking') return null;
  return {
    status: c.status,
    problems: c.problems,
    attempt: c.attempt,
    requestedBy: c.requestedBy,
    checkedAt: now.toISOString(),
  };
}

// ── The loop ────────────────────────────────────────────────────────────────

export interface TurnRunnerDeps {
  /** The engine's event stream for this turn. */
  run: () => AsyncIterable<ConversationEvent>;
  /** Called with every job state change (the wiring publishes + persists it). */
  update: (job: TurnJob) => void | Promise<void>;
  /** Streamed assistant text. */
  onText?: (delta: string) => void;
  /** A tool changed files (the wiring refreshes the Artifacts tree). */
  onMutation?: () => void;
  onToolDone?: () => void;
  onUsage?: (inputTokens: number, outputTokens: number, cachedInputTokens: number) => void;
  /**
   * Take a Growth snapshot labelled for the step; resolves to the snapshot
   * crux id. Absent when the snapshot policy is not per-turn (timed / manual)
   * — then the end-of-turn policy handles it exactly as before.
   */
  snapshot?: (label: string) => Promise<string | null>;
  /**
   * Latest snapshot id in the workspace — read before/after a `snapshot` tool
   * call so a model-taken snapshot completes the step without a second one.
   */
  latestSnapshotId?: () => string | null;
  /** Consulted after the loop: did the user stop the job (and why)? */
  stopReason?: () => TurnStopReason | null;
  aborted?: () => boolean;
}

export interface TurnRunResult {
  job: TurnJob;
  content: string;
  toolCalls: ToolCall[];
  /** Files changed after the last snapshot this job took (or with none taken). */
  uncapturedMutation: boolean;
}

/** Tool the model may call (B0) to checkpoint on its own terms. */
const SNAPSHOT_TOOL = 'snapshot';

export async function runTurnJob(initial: TurnJob, deps: TurnRunnerDeps): Promise<TurnRunResult> {
  let job = initial;
  let content = '';
  const toolCalls: ToolCall[] = [];
  let planParsed = false;
  let mutatedSinceSnapshot = false;
  let sawError = false;
  let snapshotIdBeforeTool: string | null = null;

  const publish = async (next: TurnJob) => {
    job = next;
    await deps.update(job);
  };

  const completeStep = (snapshotId: string | null): TurnJob => {
    const steps = job.plan.steps.map((s, i) =>
      i === job.currentStep
        ? { ...s, status: 'done' as const, ...(snapshotId ? { snapshotId } : {}) }
        : s,
    );
    let currentStep = job.currentStep;
    if (currentStep < steps.length - 1) {
      currentStep++;
      steps[currentStep] = { ...steps[currentStep]!, status: 'running' };
    }
    return {
      ...job,
      status: 'running',
      plan: { ...job.plan, steps },
      currentStep,
      snapshotIds: snapshotId ? [...job.snapshotIds, snapshotId] : job.snapshotIds,
    };
  };

  try {
    for await (const event of deps.run()) {
      switch (event.type) {
        case 'text': {
          content += event.content;
          deps.onText?.(event.content);
          if (!planParsed && !hasOpenPlanFence(content)) {
            const titles = parsePlan(content);
            if (titles) {
              planParsed = true;
              await publish({
                ...job,
                status: 'running',
                plan: {
                  explicit: true,
                  steps: titles.map((title, i) => ({
                    title,
                    status: i === 0 ? 'running' : 'pending',
                  })),
                },
                currentStep: 0,
              });
            }
          }
          break;
        }

        case 'tool_start': {
          toolCalls.push({ name: event.name, id: event.id, input: event.input, result: undefined });
          if (event.name === SNAPSHOT_TOOL) {
            snapshotIdBeforeTool = deps.latestSnapshotId?.() ?? null;
          }
          if (job.status === 'planning') {
            // Acting without a plan: the implicit single step is the plan.
            planParsed = true;
            await publish({ ...job, status: 'running' });
          }
          break;
        }

        case 'tool_result': {
          const tc = toolCalls.find((t) => t.id === event.id);
          if (tc) tc.result = event.result;
          deps.onToolDone?.();
          if (didMutate(event.name, event.result)) {
            mutatedSinceSnapshot = true;
            deps.onMutation?.();
          }
          if (event.name === SNAPSHOT_TOOL && !event.result.startsWith('Error')) {
            // The model checkpointed itself: that snapshot completes the step.
            const after = deps.latestSnapshotId?.() ?? null;
            const taken = after && after !== snapshotIdBeforeTool ? after : null;
            mutatedSinceSnapshot = false;
            await publish(completeStep(taken));
          }
          break;
        }

        case 'step_end': {
          if (mutatedSinceSnapshot && deps.snapshot && job.plan.explicit) {
            const label = stepLabel(job, job.currentStep);
            let id: string | null = null;
            try {
              id = await deps.snapshot(label);
            } catch (err) {
              console.warn('Step snapshot failed:', err);
            }
            mutatedSinceSnapshot = false;
            await publish(completeStep(id));
          }
          break;
        }

        case 'usage':
          deps.onUsage?.(event.inputTokens, event.outputTokens, event.cachedInputTokens);
          break;

        case 'info':
          content += `\n\n*${event.message}*`;
          deps.onText?.(`\n\n*${event.message}*`);
          break;

        case 'error':
          sawError = true;
          content += `\n\n*Error: ${event.message}*`;
          deps.onText?.(`\n\n*Error: ${event.message}*`);
          await publish({ ...job, error: event.message });
          break;

        case 'done':
          break;
      }
    }
  } catch (err: unknown) {
    const e = err as Error;
    if (e.name !== 'AbortError' && !deps.aborted?.()) {
      sawError = true;
      content += `\n\n*Error: ${e.message}*`;
      await publish({ ...job, error: e.message });
    }
  }

  const stopReason = deps.stopReason?.() ?? null;
  const wasAborted = !!stopReason || !!deps.aborted?.();
  const finalStatus: TurnJobStatus = wasAborted ? 'interrupted' : sawError ? 'failed' : 'done';
  await publish(finishJob(job, finalStatus, { stopReason: stopReason ?? undefined }));

  return {
    job,
    content,
    toolCalls,
    uncapturedMutation:
      mutatedSinceSnapshot ||
      (!deps.snapshot && toolCalls.some((tc) => didMutate(tc.name, tc.result ?? ''))),
  };
}

/** Close a job out: every step gets a terminal status, the clock stops. */
export function finishJob(
  job: TurnJob,
  status: 'done' | 'failed' | 'interrupted',
  extra: { stopReason?: TurnStopReason; error?: string } = {},
): TurnJob {
  const steps = job.plan.steps.map((s, i) => {
    if (s.status === 'done') return s;
    if (status === 'done') return { ...s, status: 'done' as const };
    // Failed / interrupted: the step in flight is marked, later ones stay pending.
    return i === job.currentStep ? { ...s, status: 'interrupted' as const } : s;
  });
  return {
    ...job,
    status,
    plan: { ...job.plan, steps },
    endedAt: new Date().toISOString(),
    ...(extra.stopReason ? { stopReason: extra.stopReason } : {}),
    ...(extra.error ? { error: extra.error } : {}),
  };
}

/** Attach the finished job to the assistant message it produced. */
export function stampJob(message: ChatMessage, job: TurnJob): ChatMessage {
  return { ...message, job: summarizeJob(job) };
}
