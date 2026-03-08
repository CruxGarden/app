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
        'w-6 h-6 shrink-0 rounded-[var(--radius-sm)] overflow-hidden flex items-center justify-center ring-1 ring-border',
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
    <div className={cn('flex gap-2 items-end', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && <KeeperAvatar />}
      <div
        className={cn(
          'max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm break-words',
          isUser ? 'bg-accent-muted text-text' : 'bg-[color-mix(in_srgb,var(--panel),var(--text)_8%)] text-text',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {(() => {
              const counts = new Map<string, number>();
              for (const tc of message.toolCalls) {
                const label =
                  tc.name === 'write_file' ? `Wrote ${String(tc.input?.path ?? '')}` :
                  tc.name === 'edit_file' ? `Edited ${String(tc.input?.path ?? '')}` :
                  tc.name === 'read_file' ? `Read ${String(tc.input?.path ?? '')}` :
                  tc.name === 'delete_file' ? `Deleted ${String(tc.input?.path ?? '')}` :
                  tc.name === 'list_files' ? 'Listed files' :
                  tc.name === 'set_palette' ? 'Applied palette' :
                  tc.name === 'get_palette' ? 'Read palette' :
                  null;
                if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
              }
              return [...counts.entries()].map(([label, count]) => (
                <div
                  key={label}
                  className="text-xs font-mono text-text-muted bg-bg rounded px-2 py-1"
                >
                  {count > 1 ? `${label} ×${count}` : label}
                </div>
              ));
            })()}
          </div>
        )}
      </div>
      {isUser && <UserAvatar avatarUrl={avatarUrl} initial={userInitial} />}
    </div>
  );
}
