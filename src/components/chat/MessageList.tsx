import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/api/types';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useAppStore } from '@/stores/appStore';
import MessageBubble from './MessageBubble';
import { ConsoleAvatar } from '@/components/keeper/Console';
import MarkdownRenderer from './MarkdownRenderer';

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
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 && !isStreaming && (
        <div className="text-text-muted">
          <p className="text-xs text-center">Start a conversation to begin collaborating</p>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} avatarUrl={avatarUrl} userInitial={userInitial} />
      ))}

      {truncatedAfter != null && truncatedAfter > 0 && (
        <div className="flex items-center gap-2 py-2">
          <div className="flex-1 border-t border-accent/30" />
          <span className="text-[10px] font-mono text-accent/70 shrink-0">
            snapshot taken here — {truncatedAfter} message{truncatedAfter !== 1 ? 's' : ''} after
          </span>
          <div className="flex-1 border-t border-accent/30" />
        </div>
      )}

      {isStreaming && streamingContent && (
        <div className="flex gap-2 items-end justify-start">
          <ConsoleAvatar />
          <div className="max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm bg-[color-mix(in_srgb,var(--panel),var(--text)_8%)] text-text">
            <MarkdownRenderer content={streamingContent} />
            <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        </div>
      )}

      {isStreaming && !streamingContent && (
        <div className="flex gap-2 items-end justify-start">
          <ConsoleAvatar />
          <div className="rounded-[var(--radius)] px-3 py-2 bg-[color-mix(in_srgb,var(--panel),var(--text)_8%)]">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
