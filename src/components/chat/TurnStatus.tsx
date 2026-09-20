import { useCruxStore } from '@/stores/cruxStore';
import { isJobActive } from '@/services/turn-jobs';
import { isSubagentActive } from '@/services/subagents';
import { cn } from '@/lib/cn';

/**
 * One quiet line while the collaborator works — "Working… · 3 running tasks"
 * — in place of the old three-dot bubble. The Background Turn card above the
 * composer stays the place for the plan and the controls; this only says
 * that something is happening and how much of it. `quiet` keeps it to the
 * dot once words are streaming in above it.
 */
export default function TurnStatus({ quiet = false }: { quiet?: boolean }) {
  const job = useCruxStore((s) => s.turnJob);
  const active = isJobActive(job);
  const running = job?.subagents?.filter(isSubagentActive).length ?? 0;
  const parts: string[] = [];
  if (!quiet) parts.push(job?.status === 'checking' ? 'Checking…' : 'Working…');
  if (running > 0) parts.push(`${running} running task${running === 1 ? '' : 's'}`);
  else if (active && job?.plan.explicit && !quiet)
    parts.push(
      `step ${Math.min(job.currentStep + 1, job.plan.steps.length)} of ${job.plan.steps.length}`,
    );
  if (quiet && parts.length === 0) return null;
  return (
    <div
      className={cn('flex items-center gap-2 pl-10 text-2xs font-mono text-chat-text-muted')}
      data-testid="turn-status"
      role="status"
      aria-live="polite"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent motion-attention shrink-0" />
      <span>{parts.join(' · ')}</span>
    </div>
  );
}
