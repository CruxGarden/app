import { ChatPanel } from '@/components/chat';
import { useCruxStore } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';
import PaneHeader from './PaneHeader';

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function DeleteConfirmations() {
  const pendingDeletes = useCruxStore((s) => s.pendingDeletes);
  const confirmDelete = useCruxStore((s) => s.confirmDelete);
  const dismissDelete = useCruxStore((s) => s.dismissDelete);

  if (pendingDeletes.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2">
      {pendingDeletes.map((d) => (
        <div
          key={d.attachmentId}
          className="flex items-center justify-between gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-error-muted border border-error/30"
        >
          <span className="text-xs font-mono text-text truncate">
            Delete <strong>{d.path}</strong>?
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => dismissDelete(d.attachmentId)}
              className="px-2 py-0.5 text-[11px] font-mono text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              Keep
            </button>
            <button
              onClick={() => confirmDelete(d.attachmentId)}
              className={cn(
                'px-2 py-0.5 text-[11px] font-mono rounded-[var(--radius-sm)]',
                'bg-error text-bg hover:brightness-110 transition-all cursor-pointer',
              )}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChatPane() {
  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="collaboration" icon={<ChatIcon />} label="Collaboration" />

      <div className="flex-1 min-h-0">
        <ChatPanel />
      </div>

      <DeleteConfirmations />
    </div>
  );
}
