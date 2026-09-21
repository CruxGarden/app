import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/api/types';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useAppStore } from '@/stores/appStore';
import MessageBubble from './MessageBubble';
import { ConsoleAvatar } from '@/components/keeper/Console';
import MarkdownRenderer from './MarkdownRenderer';
import TurnStatus from './TurnStatus';
import ToolCallRows from './ToolCallRows';
import { useCruxStore } from '@/stores/cruxStore';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  truncatedAfter?: number;
}

export default function MessageList({
  messages,
  streamingContent,
  isStreaming,
  truncatedAfter,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const author = useAppStore((s) => s.author);
  // The work as it happens, folded under the reply being written — the same
  // one expandable line the finished reply keeps, and the same line the
  // console has always shown while the Keeper works.
  const liveToolCalls = useCruxStore((s) => s.streamingToolCalls);

  const userInitial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const avatarUrl = useAvatarUrl(author);

  useEffect(() => {
    if (!hasScrolledRef.current) {
      // First render: jump to bottom instantly
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      hasScrolledRef.current = true;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent, liveToolCalls]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {messages.length === 0 && !isStreaming && (
        <div className="text-text-muted">
          <p className="text-sm font-medium">What would you like to make?</p>
          <p className="text-xs mt-2">
            Describe the result you have in mind and who it is for. Choose a collaborator below,
            then send your idea. Your creation will appear in the Workshop as it takes shape.
          </p>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} avatarUrl={avatarUrl} userInitial={userInitial} />
      ))}

      {truncatedAfter != null && truncatedAfter > 0 && (
        <div className="flex items-center gap-2 py-2">
          <div className="flex-1 border-t border-accent/30" />
          <span className="text-2xs font-mono text-accent/70 shrink-0">
            snapshot taken here — {truncatedAfter} message{truncatedAfter !== 1 ? 's' : ''} after
          </span>
          <div className="flex-1 border-t border-accent/30" />
        </div>
      )}

      {isStreaming && (streamingContent || liveToolCalls.length > 0) && (
        <div className="flex gap-1.5 items-start" data-role="assistant" data-streaming="true">
          <div className="pt-0.5">
            <ConsoleAvatar />
          </div>
          <div className="min-w-0 flex-1 pl-2 border-l-2 border-chat-ai-bubble-border font-reading text-[0.95rem] leading-[1.6] text-chat-ai-bubble-text break-words motion-enter-bubble">
            {streamingContent && (
              <>
                <MarkdownRenderer content={streamingContent} />
                <span className="inline-block w-1.5 h-4 bg-accent/60 motion-attention ml-0.5 align-text-bottom" />
              </>
            )}
            {liveToolCalls.length > 0 && (
              <div className={streamingContent ? 'mt-2' : undefined}>
                <ToolCallRows calls={liveToolCalls} />
              </div>
            )}
          </div>
        </div>
      )}

      {isStreaming && <TurnStatus quiet={!!streamingContent} />}

      <div ref={bottomRef} />
    </div>
  );
}
