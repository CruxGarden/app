import PaneHeader from './PaneHeader';

function PublishIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

export default function PublishPane() {
  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="publish" icon={<PublishIcon />} label="Publish" />
      <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-3 p-6">
        <PublishIcon />
        <p className="text-xs text-center">
          Publish is coming soon.
        </p>
      </div>
    </div>
  );
}
