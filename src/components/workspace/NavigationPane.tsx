import PaneHeader from './PaneHeader';

function StackIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

export default function NavigationPane() {
  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="history" icon={<StackIcon />} label="History" />
      <div className="text-text-muted p-4">
        <p className="text-xs text-center">Coming soon</p>
      </div>
    </div>
  );
}
