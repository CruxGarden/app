import type { ProgressDisplay } from '@/services/task-progress';

/** Shared feedback for the owning Collaboration and its background-work listings. */
export default function TaskProgress({
  progress,
  label = 'Task progress',
}: {
  progress?: ProgressDisplay;
  label?: string;
}) {
  if (!progress) return null;
  const caption = progress.complete
    ? 'Turn finished'
    : progress.percent === null
      ? progress.running
        ? 'Working'
        : 'Estimate unavailable'
      : `${progress.running ? 'Estimated' : 'Last estimate'} ${progress.percent}%`;
  return (
    <div className="min-w-0 space-y-1 text-2xs text-text-muted" title={progress.message}>
      <div className="flex flex-wrap gap-x-2 justify-between">
        <span className="min-w-0 flex-1 basis-24 truncate">{progress.message}</span>
        <span className="shrink-0 font-mono">{caption}</span>
      </div>
      {(progress.running || progress.percent !== null) && (
        <progress
          aria-label={label}
          aria-valuetext={`${caption}: ${progress.message}`}
          max={100}
          value={progress.percent ?? undefined}
          className="block h-1.5 w-full accent-accent"
        />
      )}
    </div>
  );
}
