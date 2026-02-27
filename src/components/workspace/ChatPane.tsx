import { ChatPanel } from '@/components/chat';
import PaneHeader from './PaneHeader';

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function ChatPane() {
  return (
    <div className="flex flex-col h-full">
      <PaneHeader paneType="chat" icon={<ChatIcon />} label="Conversation" />

      <div className="flex-1 min-h-0">
        <ChatPanel />
      </div>
    </div>
  );
}
