import PaneHeader from './PaneHeader';

function SyncIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="20" x2="7" y2="4" />
      <polyline points="3 8 7 4 11 8" />
      <line x1="17" y1="4" x2="17" y2="20" />
      <polyline points="13 16 17 20 21 16" />
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
