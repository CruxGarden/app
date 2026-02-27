import PaneHeader from './PaneHeader';

function SyncIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export default function SyncPane() {
  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="sync" icon={<SyncIcon />} label="Sync" />
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-3 p-6">
        <SyncIcon />
        <p className="text-xs text-center">
          Sync is coming soon.
        </p>
      </div>
    </div>
  );
}
