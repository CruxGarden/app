import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { ChatMessage, ToolCall } from '@/api/types';
import { getModelShortName } from '@/ai/providers';
import MarkdownRenderer from './MarkdownRenderer';
import { ConsoleAvatar } from '@/components/keeper/Console';
import { useCruxStore } from '@/stores/cruxStore';
import { useBlobUrl } from '@/hooks/useBlobUrl';

/** Resolve persona snapshot from crux meta by fingerprint */
function usePersonaSnapshot(fingerprint?: string) {
  const meta = useCruxStore((s) => s.crux?.meta) as Record<string, unknown> | undefined;
  const snapshots = meta?.personaSnapshots as
    | Record<string, { name?: string; thumbnailFingerprint?: string; thumbnailDataUrl?: string }>
    | undefined;
  const snapshot = fingerprint ? snapshots?.[fingerprint] : undefined;
  return snapshot && typeof snapshot === 'object' ? snapshot : null;
}

/** Look up the persona avatar for a message — resolves OPFS blob by fingerprint */
function MessageAvatar({ fingerprint }: { fingerprint?: string }) {
  const snapshot = usePersonaSnapshot(fingerprint);
  const blobUrl = useBlobUrl(snapshot?.thumbnailFingerprint);
  if (blobUrl) {
    return (
      <img
        src={blobUrl}
        alt=""
        className="w-6 h-6 aspect-square shrink-0 object-cover [image-rendering:pixelated] rounded-[var(--radius-sm)] ring-1 ring-border"
      />
    );
  }
  return <ConsoleAvatar bordered />;
}

interface MessageBubbleProps {
  message: ChatMessage;
  avatarUrl?: string | null;
  userInitial?: string;
}

/** Resolve author info from crux.meta.authorSnapshots */
function useAuthorSnapshot(authorId?: string) {
  const meta = useCruxStore((s) => s.crux?.meta) as Record<string, unknown> | undefined;
  const snapshots = meta?.authorSnapshots as
    | Record<string, { username?: string; avatarFingerprint?: string }>
    | undefined;
  const snapshot = authorId ? snapshots?.[authorId] : undefined;
  return snapshot && typeof snapshot === 'object' ? snapshot : null;
}

function UserAvatar({
  message,
  fallbackUrl,
  fallbackInitial,
}: {
  message: ChatMessage;
  fallbackUrl?: string | null;
  fallbackInitial: string;
}) {
  const authorSnapshot = useAuthorSnapshot(message.authorId);
  const blobUrl = useBlobUrl(authorSnapshot?.avatarFingerprint);
  const avatarUrl = blobUrl || (!authorSnapshot?.avatarFingerprint ? fallbackUrl : null);
  const initial = authorSnapshot?.username?.charAt(0)?.toUpperCase() || fallbackInitial;

  return (
    <div
      className={cn(
        'w-6 h-6 shrink-0 rounded-[var(--radius-sm)] overflow-hidden flex items-center justify-center ring-1 ring-border',
        !avatarUrl &&
          'bg-chat-user-bubble text-chat-user-bubble-text text-[10px] font-display font-bold',
      )}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initial}
    </div>
  );
}

function getToolLabel(tc: ToolCall): string {
  switch (tc.name) {
    case 'write_file':
      return `Wrote ${String(tc.input?.path ?? '')}`;
    case 'edit_file':
      return `Edited ${String(tc.input?.path ?? '')}`;
    case 'read_file':
      return `Read ${String(tc.input?.path ?? '')}`;
    case 'delete_file':
      return `Deleted ${String(tc.input?.path ?? '')}`;
    case 'list_files':
      return 'Listed files';
    case 'set_palette':
      return 'Applied palette';
    case 'get_palette':
      return 'Read palette';
    case 'generate_image':
      return `Generated ${String(tc.input?.path ?? 'image')}`;
    default:
      return tc.name;
  }
}

function ToolCallItem({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const label = getToolLabel(tc);
  const hasResult = !!tc.result;
  const isError =
    tc.result?.includes('ERROR') || tc.result?.includes('Error') || tc.result?.includes('failed');

  return (
    <div>
      <button
        onClick={() => hasResult && setExpanded((v) => !v)}
        className={cn(
          'text-xs font-mono bg-code-block rounded px-2 py-1 flex items-center gap-1.5 w-full text-left transition-colors',
          hasResult ? 'cursor-pointer hover:bg-surface-hover' : 'cursor-default',
          isError ? 'text-error/70' : 'text-chat-text-muted',
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
        <pre className="mt-1 mx-1 px-2 py-1.5 text-[10px] font-mono leading-relaxed bg-code-block rounded border border-code-block-border text-chat-text-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
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

  const personaSnapshot = usePersonaSnapshot(message.personaFingerprint);
  const authorSnapshot = useAuthorSnapshot(message.authorId);
  const personaName = !isUser ? personaSnapshot?.name || 'The Keeper' : null;
  const authorName = isUser ? authorSnapshot?.username || null : null;

  return (
    <div className={cn('flex gap-2 items-end', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && <MessageAvatar fingerprint={message.personaFingerprint} />}
      <div
        className={cn(
          'max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm break-words',
          isUser
            ? 'bg-chat-user-bubble text-chat-user-bubble-text'
            : 'bg-chat-ai-bubble text-chat-ai-bubble-text',
        )}
      >
        {personaName && <div className="text-[10px] font-mono text-accent mb-1">{personaName}</div>}
        {authorName && <div className="text-[10px] font-mono text-accent mb-1">{authorName}</div>}
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
          <div className="mt-1.5 text-[10px] font-mono text-chat-text-muted/50 text-right">
            {getModelShortName(message.model) || message.model}
          </div>
        )}
      </div>
      {isUser && (
        <UserAvatar message={message} fallbackUrl={avatarUrl} fallbackInitial={userInitial} />
      )}
    </div>
  );
}
