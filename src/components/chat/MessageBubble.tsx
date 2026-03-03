import { cn } from '@/lib/cn';
import type { ChatMessage } from '@/api/types';
import MarkdownRenderer from './MarkdownRenderer';
import { KeeperAvatar } from '@/components/keeper/KeeperConsole';

interface MessageBubbleProps {
  message: ChatMessage;
  avatarUrl?: string | null;
  userInitial?: string;
}

function UserAvatar({ avatarUrl, initial }: { avatarUrl?: string | null; initial: string }) {
  return (
    <div
      className={cn(
        'w-6 h-6 shrink-0 rounded-full overflow-hidden flex items-center justify-center',
        !avatarUrl && 'bg-accent-muted text-accent text-[10px] font-display font-bold',
      )}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initial}
    </div>
  );
}

export default function MessageBubble({
  message,
  avatarUrl,
  userInitial = '?',
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && <KeeperAvatar />}
      <div
        className={cn(
          'max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm',
          isUser ? 'bg-accent-muted text-text' : 'bg-panel text-text',
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
                {tc.name === 'write_file' && <span>Wrote {String(tc.input?.path ?? '')}</span>}
                {tc.name === 'read_file' && <span>Read {String(tc.input?.path ?? '')}</span>}
                {tc.name === 'list_files' && <span>Listed files</span>}
                {tc.name === 'set_palette' && <span>Applied palette</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {isUser && <UserAvatar avatarUrl={avatarUrl} initial={userInitial} />}
    </div>
  );
}
