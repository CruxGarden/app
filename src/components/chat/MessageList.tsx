import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/api/types';
import { useAuthStore } from '@/stores/authStore';
import MessageBubble from './MessageBubble';
import { KeeperAvatar } from '@/components/keeper/KeeperConsole';
import MarkdownRenderer from './MarkdownRenderer';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
}

export default function MessageList({ messages, streamingContent, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const author = useAuthStore((s) => s.author);

  const userInitial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const avatarUrl = (() => {
    if (!author?.meta?.avatarUrl) return null;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    return `${base}${author.meta.avatarUrl}?v=${author.updated}`;
  })();

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

      {isStreaming && streamingContent && (
        <div className="flex gap-2 justify-start">
          <KeeperAvatar />
          <div className="max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm bg-panel text-text">
            <MarkdownRenderer content={streamingContent} />
            <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        </div>
      )}

      {isStreaming && !streamingContent && (
        <div className="flex gap-2 justify-start">
          <KeeperAvatar />
          <div className="rounded-[var(--radius)] px-3 py-2 bg-panel">
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
