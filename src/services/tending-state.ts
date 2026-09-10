import type { TurnJob } from './turn-jobs';

/** Observation only. A result, an unanswered decision and a check are independent. */
export type Activity =
  | 'queued'
  | 'working'
  | 'checking'
  | 'waiting'
  | 'idle'
  | 'stopping'
  | 'interrupted'
  | 'failed'
  | 'loading';
export type Evidence = 'structured' | 'crux-check' | 'inferred' | 'unknown';
export interface Attention {
  id: string;
  kind: 'permission' | 'question' | 'plan' | 'merge' | 'result' | 'configuration' | 'failure';
  reason: string;
  since: string;
  requestId?: string;
}
export interface TendingState {
  copyId: string;
  cruxId: string;
  lifetimeId: string | null;
  runId: string | null;
  model?: string;
  activity: Activity;
  attention: Attention[];
  verification: {
    status: 'not-checked' | 'checking' | 'passed' | 'failed';
    snapshotId?: string;
    note?: string;
  };
  evidence: Evidence;
  queued: number;
  canStop: boolean;
}
export interface TendingInput {
  copyId: string;
  cruxId: string;
  lifetimeId?: string;
  phase?: 'loading' | 'ready' | 'error' | 'closing';
  job: TurnJob | null;
  streaming?: boolean;
  settling?: boolean;
  queued: number;
  requests?: { id: string; requestedAt: string; reason: string }[];
  folderMissing?: boolean;
  seenTurnId?: string | null;
  evidence?: Evidence;
}
export function tendingState(input: TendingInput): TendingState {
  const { job, requests = [], evidence = 'structured' } = input;
  const active = !!input.lifetimeId;
  const running =
    !!input.streaming || ['planning', 'running', 'checking'].includes(job?.status ?? '');
  const interrupted = !active && (running || job?.status === 'queued' || job?.status === 'paused');
  let activity: Activity = interrupted
    ? 'interrupted'
    : active && requests.length
      ? 'waiting'
      : job?.status === 'queued'
        ? 'queued'
        : job?.status === 'checking'
          ? 'checking'
          : running || input.settling
            ? 'working'
            : job?.status === 'failed'
              ? 'failed'
              : job?.status === 'interrupted'
                ? 'interrupted'
                : job?.status === 'paused'
                  ? 'waiting'
                  : input.queued
                    ? 'queued'
                    : 'idle';
  if (input.phase === 'loading') activity = 'loading';
  if (input.phase === 'error') activity = 'failed';
  if (input.phase === 'closing') activity = 'stopping';
  const attention: Attention[] = active
    ? requests.map((request) => ({
        id: `permission:${input.lifetimeId}:${request.id}`,
        kind: 'permission',
        reason: request.reason,
        since: request.requestedAt,
        requestId: request.id,
      }))
    : [];
  const since = job?.endedAt ?? job?.startedAt ?? '';
  if (input.folderMissing)
    attention.push({
      id: 'folder-missing',
      kind: 'configuration',
      reason: 'Project Folder is missing',
      since: '',
    });
  if (job?.merge?.status === 'pending')
    attention.push({
      id: `merge:${job.id}`,
      kind: 'merge',
      reason: 'Worker changes need a decision',
      since,
    });
  if (activity === 'failed' || activity === 'interrupted')
    attention.push({
      id: `${activity}:${job?.id ?? input.copyId}`,
      kind: 'failure',
      reason:
        activity === 'failed'
          ? 'Work failed — open Collaboration for details'
          : 'Work was interrupted',
      since,
    });
  if (
    job?.status === 'done' &&
    !input.settling &&
    !input.streaming &&
    evidence === 'structured' &&
    input.seenTurnId !== job.id
  )
    attention.push({
      id: `result:${job.id}`,
      kind: 'result',
      reason: 'A result is ready to review',
      since,
    });
  // A passed check is only asserted for the saved snapshot it identifies.
  const check = job?.check;
  const verification: TendingState['verification'] =
    !check || evidence === 'inferred' || evidence === 'unknown'
      ? { status: 'not-checked' }
      : check.status === 'checking' && active && activity === 'checking'
        ? { status: 'checking' }
        : check.status !== 'checking' && check.snapshotId
          ? {
              status: check.status === 'passed' ? 'passed' : 'failed',
              snapshotId: check.snapshotId,
              note: check.note,
            }
          : { status: 'not-checked', note: 'No completed check tied to a saved snapshot' };
  return {
    copyId: input.copyId,
    cruxId: input.cruxId,
    lifetimeId: input.lifetimeId ?? null,
    runId: job?.id ?? null,
    model: job?.model,
    activity,
    attention,
    verification,
    evidence,
    queued: input.queued,
    canStop: active && input.phase === 'ready' && running,
  };
}
export function tendingLabel(state: TendingState): string {
  if (state.attention.some((a) => a.kind === 'permission')) return 'Needs approval';
  if (state.attention.some((a) => a.kind === 'merge')) return 'Needs merge';
  if (state.attention.some((a) => a.kind === 'configuration')) return 'Needs you';
  if (
    state.attention.some((a) => a.kind === 'result') &&
    ['idle', 'queued'].includes(state.activity)
  )
    return 'Ready to review';
  return {
    queued: 'Queued',
    working: 'Working',
    checking: 'Checking',
    waiting: 'Needs you',
    idle: 'Idle',
    stopping: 'Stopping',
    interrupted: 'Interrupted',
    failed: 'Failed',
    loading: 'Loading',
  }[state.activity];
}
export interface TendingTarget {
  copyId: string;
  cruxId: string;
  lifetimeId: string | null;
  runId: string | null;
  attentionId?: string;
}
export function targetMatches(target: TendingTarget, current: TendingState): boolean {
  return (
    target.copyId === current.copyId &&
    target.cruxId === current.cruxId &&
    target.lifetimeId === current.lifetimeId &&
    target.runId === current.runId &&
    (!target.attentionId || current.attention.some((a) => a.id === target.attentionId))
  );
}
export function attentionCount(states: TendingState[]): number {
  return new Set(states.filter((s) => s.attention.length).map((s) => s.copyId)).size;
}
