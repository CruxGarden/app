import { cn } from '@/lib/cn';
import type { ChatMessage } from '@/api/types';
import MarkdownRenderer from './MarkdownRenderer';

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-[var(--radius)] px-4 py-3 text-sm',
          isUser
            ? 'bg-accent-muted text-text'
            : 'bg-surface text-text',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((tc, i) => (
              <div
                key={tc.id || i}
                className="text-xs font-mono text-text-muted bg-bg rounded px-2 py-1"
              >
                {tc.name === 'write_file' && (
                  <span>Wrote {String(tc.input?.path ?? '')}</span>
                )}
                {tc.name === 'read_file' && (
                  <span>Read {String(tc.input?.path ?? '')}</span>
                )}
                {tc.name === 'list_files' && <span>Listed files</span>}
                {tc.name === 'set_palette' && <span>Applied palette</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
