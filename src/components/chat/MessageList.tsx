import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/api/types';
import { useAuthStore } from '@/stores/authStore';
import MessageBubble, { ClaudeAvatar } from './MessageBubble';
import MarkdownRenderer from './MarkdownRenderer';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
}

export default function MessageList({
  messages,
  streamingContent,
  isStreaming,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const author = useAuthStore((s) => s.author);

  const userInitial = author?.username?.charAt(0)?.toUpperCase() ?? '?';
  const avatarUrl = (() => {
    if (!author?.meta?.avatarUrl) return null;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    return `${base}${author.meta.avatarUrl}?v=${author.updated}`;
  })();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <p className="text-text-muted text-sm">
            Start a conversation to begin collaborating.
          </p>
        </div>
      )}

      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} avatarUrl={avatarUrl} userInitial={userInitial} />
      ))}

      {isStreaming && streamingContent && (
        <div className="flex items-end gap-2 justify-start">
          <ClaudeAvatar />
          <div className="max-w-[80%] rounded-[var(--radius)] px-4 py-3 text-sm bg-surface text-text">
            <MarkdownRenderer content={streamingContent} />
            <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        </div>
      )}

      {isStreaming && !streamingContent && (
        <div className="flex items-end gap-2 justify-start">
          <ClaudeAvatar />
          <div className="rounded-[var(--radius)] px-4 py-3 bg-surface">
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
