import { useGates } from '@/hooks/useGates';
import GateTimeline from '@/components/gates/GateTimeline';
import PaneHeader from './PaneHeader';

function StackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

export default function NavigationPane() {
  const { gates, isCreatingGate, summary } = useGates();

  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="history" icon={<StackIcon />} label="History" />

      <div className="flex-1 overflow-y-auto min-h-0">
        <GateTimeline
          gates={gates}
          summary={summary}
          isCreatingGate={isCreatingGate}
        />
      </div>
    </div>
  );
}
