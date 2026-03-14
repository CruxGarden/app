import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { ChatMessage, ToolCall } from '@/api/types';
import { PROVIDERS } from '@/ai/providers';
import MarkdownRenderer from './MarkdownRenderer';
import { KeeperAvatar } from '@/components/keeper/KeeperConsole';

/** Get short display name for a model ID (e.g. "claude-sonnet-4-20250514" → "Sonnet 4") */
function getModelShortName(modelId?: string): string | null {
  if (!modelId) return null;
  for (const provider of Object.values(PROVIDERS)) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return model.name;
  }
  return null;
}

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

function getToolLabel(tc: ToolCall): string {
  switch (tc.name) {
    case 'write_file': return `Wrote ${String(tc.input?.path ?? '')}`;
    case 'edit_file': return `Edited ${String(tc.input?.path ?? '')}`;
    case 'read_file': return `Read ${String(tc.input?.path ?? '')}`;
    case 'delete_file': return `Deleted ${String(tc.input?.path ?? '')}`;
    case 'list_files': return 'Listed files';
    case 'set_palette': return 'Applied palette';
    case 'get_palette': return 'Read palette';
    case 'generate_image': return `Generated ${String(tc.input?.path ?? 'image')}`;
    default: return tc.name;
  }
}

function ToolCallItem({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const label = getToolLabel(tc);
  const hasResult = !!tc.result;
  const isError = tc.result?.includes('ERROR') || tc.result?.includes('Error') || tc.result?.includes('failed');

  return (
    <div>
      <button
        onClick={() => hasResult && setExpanded((v) => !v)}
        className={cn(
          'text-xs font-mono bg-bg rounded px-2 py-1 flex items-center gap-1.5 w-full text-left transition-colors',
          hasResult ? 'cursor-pointer hover:bg-accent-muted/30' : 'cursor-default',
          isError ? 'text-error/70' : 'text-text-muted',
        )}
      >
        {hasResult && (
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={cn('shrink-0 transition-transform', expanded && 'rotate-90')}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        )}
        <span className="truncate">{label}</span>
      </button>
      {expanded && tc.result && (
        <pre className="mt-1 mx-1 px-2 py-1.5 text-[10px] font-mono leading-relaxed bg-bg rounded border border-border text-text-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
          {tc.result}
        </pre>
      )}
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
            {message.toolCalls.map((tc, i) => (
              <ToolCallItem key={tc.id || i} tc={tc} />
            ))}
          </div>
        )}

        {/* Model badge for assistant messages */}
        {!isUser && message.model && (
          <div className="mt-1.5 text-[10px] font-mono text-text-muted/50 text-right">
            {getModelShortName(message.model) || message.model}
          </div>
        )}
      </div>
      {isUser && <UserAvatar avatarUrl={avatarUrl} initial={userInitial} />}
    </div>
  );
}
