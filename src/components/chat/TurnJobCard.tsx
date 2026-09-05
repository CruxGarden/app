import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { useCruxStore } from '@/stores/cruxStore';
import { confirmDialog } from '@/stores/dialogStore';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import {
  describeCheck,
  isFixingAfterCheck,
  isJobActive,
  type PlanStep,
  type TurnJob,
} from '@/services/turn-jobs';
import { checkNow, dismissJob, removeQueued, runNextQueued, stopTurn } from '@/services/turns';

/** Short turns look as they always did: the card only appears past this. */
const REVEAL_AFTER_MS = 3000;

function useElapsed(job: TurnJob | null): number {
  const [now, setNow] = useState(() => Date.now());
  const active = isJobActive(job);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, job?.id]);
  if (!job) return 0;
  const end = active ? now : job.endedAt ? Date.parse(job.endedAt) : now;
  return Math.max(0, end - Date.parse(job.startedAt));
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function StepMark({ status }: { status: PlanStep['status'] }) {
  const base = 'inline-flex w-3.5 h-3.5 shrink-0 items-center justify-center text-2xs font-mono';
  switch (status) {
    case 'done':
      return (
        <span className={cn(base, 'text-accent')} aria-label="done">
          ✓
        </span>
      );
    case 'running':
      return (
        <span className={cn(base)} aria-label="in progress">
          <span className="w-1.5 h-1.5 rounded-full bg-accent motion-attention" />
        </span>
      );
    case 'interrupted':
      return (
        <span className={cn(base, 'text-error')} aria-label="stopped">
          ✕
        </span>
      );
    default:
      return (
        <span className={cn(base, 'text-text-muted/60')} aria-label="pending">
          ·
        </span>
      );
  }
}

function headline(job: TurnJob): string {
  if (isFixingAfterCheck(job)) return 'Check found problems · fixing';
  switch (job.status) {
    case 'checking':
      return describeCheck('checking');
    case 'planning':
      return 'Working on…';
    case 'running':
      return 'Working on…';
    case 'interrupted':
      return job.stopReason === 'closed'
        ? 'Interrupted — the app closed while this was running'
        : job.stopReason === 'steered'
          ? 'Stopped to steer'
          : 'Stopped';
    case 'failed':
      return 'Failed';
    default:
      return job.check && job.check.status !== 'checking'
        ? describeCheck(job.check.status)
        : 'Finished';
  }
}

/** The screenshot a check took, from the Blob Store. */
function CheckShot({ fingerprint, ok }: { fingerprint: string; ok: boolean }) {
  const url = useBlobUrl(fingerprint, 'image/jpeg');
  if (!url) return null;
  return (
    <img
      src={url}
      alt={ok ? 'Checked screenshot' : 'Screenshot with problems'}
      data-testid="check-shot"
      data-ok={ok ? 'true' : 'false'}
      className={cn(
        'h-14 w-auto rounded-[var(--radius-sm)] border object-cover object-top',
        ok ? 'border-accent/40' : 'border-error/40',
      )}
    />
  );
}

/**
 * The Background Turn card above the composer: plan steps with status, the
 * current step, elapsed time, Stop while running, and afterwards Restore to
 * the last snapshot. Everything the job can do, a person can do here.
 */
export default function TurnJobCard() {
  const job = useCruxStore((s) => s.turnJob);
  const queue = useCruxStore((s) => s.turnQueue);
  const growths = useCruxStore((s) => s.growths);
  const revertToSnapshot = useCruxStore((s) => s.revertToSnapshot);
  const elapsed = useElapsed(job);
  const [restoring, setRestoring] = useState(false);

  const active = isJobActive(job);
  const hasQueue = queue.length > 0;

  // Reveal: a plan, a stop/failure, a queue, a check, or a turn that has run a
  // while. A passed automatic check folds away (the reply carries "Checked ✓");
  // a check the person asked for, or one that found problems, stays until dismissed.
  const checkKeepsCard =
    !!job?.check && (job.check.status !== 'passed' || job.check.requestedBy === 'person');
  const reveal =
    !!job &&
    ((job.status !== 'done' &&
      (job.plan.explicit ||
        job.status === 'interrupted' ||
        job.status === 'failed' ||
        job.status === 'checking' ||
        elapsed >= REVEAL_AFTER_MS)) ||
      checkKeepsCard);
  if (!reveal && !hasQueue) return null;

  const lastSnapshotId = job && job.snapshotIds.length > 0 ? job.snapshotIds.at(-1)! : null;
  const lastSnapshot = lastSnapshotId
    ? (growths.find((g) => g.targetId === lastSnapshotId) ?? null)
    : null;
  const lastSnapshotLabel = (lastSnapshot?.meta?.label as string | undefined) ?? null;

  const handleRestore = async () => {
    if (!lastSnapshotId) return;
    const ok = await confirmDialog({
      title: 'Restore last snapshot',
      message: `Restore the workspace to ${
        lastSnapshotLabel ? `"${lastSnapshotLabel}"` : 'the last snapshot this turn took'
      }? Your current state will be saved as a snapshot first.`,
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    setRestoring(true);
    try {
      await revertToSnapshot(lastSnapshotId);
      await dismissJob();
    } finally {
      setRestoring(false);
    }
  };

  const currentStep = job?.plan.steps[job.currentStep];
  const doneCount = job?.plan.steps.filter((s) => s.status === 'done').length ?? 0;

  const btn = cn(
    'px-2 py-0.5 text-xxs font-mono rounded-[var(--radius-sm)] border transition-colors cursor-pointer',
    'text-text-muted hover:text-text border-border hover:border-accent/50',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  );

  return (
    <div
      data-testid="turn-job"
      data-status={job?.status ?? 'idle'}
      data-check={job?.check?.status ?? 'none'}
      className="mx-3 mb-2 rounded-[var(--radius)] border border-border bg-chat-ai-bubble text-chat-ai-bubble-text text-xs motion-enter-toast"
    >
      {job && reveal && (
        <div className="px-3 pt-2 pb-2 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-2xs text-accent">{headline(job)}</div>
              <div className="truncate" title={currentStep?.title ?? job.prompt}>
                {active ? (currentStep?.title ?? job.prompt) : job.prompt}
              </div>
            </div>
            <div className="shrink-0 font-mono text-2xs text-text-muted text-right">
              {job.plan.explicit && (
                <div>
                  Step {Math.min(job.currentStep + 1, job.plan.steps.length)} of{' '}
                  {job.plan.steps.length}
                </div>
              )}
              <div>{formatElapsed(elapsed)}</div>
            </div>
          </div>

          {job.plan.explicit && (
            <ol className="space-y-0.5" aria-label="Plan">
              {job.plan.steps.map((step, i) => (
                <li
                  key={i}
                  data-testid="plan-step"
                  data-status={step.status}
                  className={cn(
                    'flex items-center gap-1.5',
                    step.status === 'pending' && 'text-text-muted/70',
                    step.status === 'running' && 'text-text',
                  )}
                >
                  <StepMark status={step.status} />
                  <span className="truncate">
                    <span className="font-mono text-text-muted/70 mr-1">{i + 1}.</span>
                    {step.title}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {job.error && job.stopReason !== 'closed' && (
            <div className="text-2xs text-error/80 break-words">{job.error}</div>
          )}

          {job.check && job.check.problems.length > 0 && (
            <ul className="space-y-0.5 text-2xs text-error/90" data-testid="check-problems">
              {job.check.problems.map((p, i) => (
                <li key={i} className="whitespace-pre-wrap break-words">
                  {p}
                </li>
              ))}
            </ul>
          )}
          {job.check && job.check.shots.length > 0 && (
            <div className="flex items-center gap-1.5">
              {job.check.shots.map((shot, i) => (
                <CheckShot
                  key={`${shot.fingerprint}-${i}`}
                  fingerprint={shot.fingerprint}
                  ok={shot.ok}
                />
              ))}
            </div>
          )}
          {job.check?.note && job.status !== 'checking' && (
            <div className="text-2xs text-text-muted/80">{job.check.note}</div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {active ? (
              <button
                onClick={() => stopTurn('stopped')}
                className={cn(btn, 'text-error/80 hover:text-error border-error/30')}
              >
                Stop
              </button>
            ) : (
              <>
                {lastSnapshotId && (
                  <button
                    onClick={handleRestore}
                    disabled={restoring}
                    className={cn(btn, 'text-accent border-accent/40')}
                    title={lastSnapshotLabel ?? undefined}
                  >
                    Restore last snapshot
                  </button>
                )}
                {job.check && (
                  <button onClick={() => void checkNow()} className={btn}>
                    Check it
                  </button>
                )}
                <button onClick={() => void dismissJob()} className={btn}>
                  Dismiss
                </button>
              </>
            )}
            {!active && job.snapshotIds.length > 0 && (
              <span className="font-mono text-2xs text-text-muted ml-auto">
                {doneCount} of {job.plan.steps.length} steps · {job.snapshotIds.length} snapshot
                {job.snapshotIds.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      )}

      {hasQueue && (
        <div
          className={cn('px-3 py-1.5 space-y-1', job && reveal && 'border-t border-border')}
          data-testid="turn-queue"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xs text-text-muted">Queued · {queue.length}</span>
            {!active && (
              <button onClick={() => void runNextQueued()} className={btn}>
                Run next
              </button>
            )}
          </div>
          <ul className="space-y-0.5">
            {queue.map((q, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="truncate flex-1 text-text-muted" title={q}>
                  {q}
                </span>
                <button
                  onClick={() => void removeQueued(i)}
                  className="text-2xs font-mono text-text-muted hover:text-error cursor-pointer"
                  aria-label={`Remove queued message ${i + 1}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
