import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { getPersona } from '@/services/persona';
import type { ChatMessage, ToolCall } from '@/api/types';
import { getModelShortName } from '@/ai/providers';
import MarkdownRenderer from './MarkdownRenderer';
import { ConsoleAvatar } from '@/components/keeper/Console';
import { useCruxStore } from '@/stores/cruxStore';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { describeCheck, describeJobSummary } from '@/services/turn-jobs';
import type { TurnCheckSummary } from '@/api/types';

/** Verify-before-done record under a reply: "Checked ✓" (or the problems) and the screenshot. */
function CheckLine({ check }: { check: TurnCheckSummary }) {
  const url = useBlobUrl(check.thumbnailFingerprint, 'image/jpeg');
  const ok = check.status === 'passed';
  return (
    <div className="mt-1.5 space-y-1" data-testid="check-record" data-status={check.status}>
      <div
        className={cn('text-2xs font-mono', ok ? 'text-accent' : 'text-error/90')}
        data-testid="check-result"
      >
        {describeCheck(check.status)}
      </div>
      {!ok && check.problems.length > 0 && (
        <ul className="text-2xs text-chat-text-muted/80 space-y-0.5">
          {check.problems.map((p, i) => (
            <li key={i} className="whitespace-pre-wrap break-words">
              {p}
            </li>
          ))}
        </ul>
      )}
      {url && (
        <img
          src={url}
          alt={ok ? 'Checked screenshot' : 'Screenshot with problems'}
          data-testid="check-thumb"
          className={cn(
            'h-16 w-auto rounded-[var(--radius-sm)] border object-cover object-top',
            ok ? 'border-accent/40' : 'border-error/40',
          )}
        />
      )}
    </div>
  );
}

/** Resolve persona snapshot from crux meta by fingerprint */
function usePersonaSnapshot(fingerprint?: string) {
  const meta = useCruxStore((s) => s.crux?.meta) as Record<string, unknown> | undefined;
  const snapshots = meta?.personaSnapshots as
    | Record<string, { name?: string; thumbnailFingerprint?: string; thumbnailDataUrl?: string }>
    | undefined;
  const snapshot = fingerprint ? snapshots?.[fingerprint] : undefined;
  return snapshot && typeof snapshot === 'object' ? snapshot : null;
}

/**
 * The current persona's name — read once, refreshed on 'crux:persona-changed'.
 * `getPersona()` parses JSON from the settings cache; calling it in every
 * assistant bubble's render was a JSON.parse per message per keystroke.
 */
let personaNameCache: string | null = null;
function currentPersonaName(): string {
  if (personaNameCache === null) personaNameCache = getPersona().name;
  return personaNameCache;
}
if (typeof window !== 'undefined') {
  window.addEventListener('crux:persona-changed', () => {
    personaNameCache = null;
  });
}

function usePersonaName(): string {
  const [name, setName] = useState(currentPersonaName);
  useEffect(() => {
    const refresh = () => setName(currentPersonaName());
    window.addEventListener('crux:persona-changed', refresh);
    return () => window.removeEventListener('crux:persona-changed', refresh);
  }, []);
  return name;
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
          'bg-chat-user-bubble text-chat-user-bubble-text text-2xs font-display font-bold',
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
    case 'rename_file':
      return `Renamed ${String(tc.input?.old_path ?? '')} → ${String(tc.input?.new_path ?? '')}`;
    case 'search_files':
      return `Searched for ${String(tc.input?.query ?? '')}`;
    case 'check_site':
      return 'Checked the build';
    case 'snapshot':
      return tc.input?.label ? `Snapshot "${String(tc.input.label)}"` : 'Took a snapshot';
    case 'list_snapshots':
      return 'Listed snapshots';
    case 'restore':
      return `Restored snapshot ${String(tc.input?.snapshotId ?? '')}`;
    case 'branch':
      return tc.input?.label
        ? `Branched "${String(tc.input.label)}"`
        : `Branched from ${String(tc.input?.snapshotId ?? '')}`;
    case 'diff':
      return 'Compared snapshots';
    case 'remember':
      return `Remembered ${String(tc.input?.section ?? 'a note')}`;
    case 'load_skill':
      return `Loaded skill ${String(tc.input?.name ?? '')}`;
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
        <pre className="mt-1 mx-1 px-2 py-1.5 text-2xs font-mono leading-relaxed bg-code-block rounded border border-code-block-border text-chat-text-muted overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
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
  const currentName = usePersonaName();
  // An external agent's tool records (ADR 0013) are attributed to that agent,
  // not to the persona.
  const personaName = !isUser
    ? message.agent
      ? message.agent
      : personaSnapshot?.name || currentName
    : null;
  // The check's findings sit on the person's side but are the app's words (B4).
  const fromCheck = isUser && message.origin === 'check';
  const authorName = fromCheck ? 'Check' : isUser ? authorSnapshot?.username || null : null;

  return (
    <div
      className={cn('flex gap-2 items-end', isUser ? 'justify-end' : 'justify-start')}
      {...(fromCheck ? { 'data-testid': 'check-message' } : {})}
    >
      {!isUser && <MessageAvatar fingerprint={message.personaFingerprint} />}
      <div
        className={cn(
          'max-w-[85%] rounded-bubble px-3 py-2 text-sm break-words border motion-enter-bubble',
          isUser
            ? 'bg-chat-user-bubble text-chat-user-bubble-text border-chat-user-bubble-border'
            : 'bg-chat-ai-bubble text-chat-ai-bubble-text border-chat-ai-bubble-border',
        )}
      >
        {personaName && <div className="text-2xs font-mono text-accent mb-1">{personaName}</div>}
        {authorName && <div className="text-2xs font-mono text-accent mb-1">{authorName}</div>}
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

        {/* Background Turn record: "Ran 3 steps · 2 snapshots" (planned turns only —
            a one-step reply reads exactly as it always did) */}
        {!isUser && message.job && (message.job.steps > 1 || message.job.status !== 'done') && (
          <div
            className="mt-1.5 text-2xs font-mono text-chat-text-muted/70"
            data-testid="turn-summary"
          >
            {describeJobSummary(message.job)}
          </div>
        )}
        {!isUser && message.job?.check && <CheckLine check={message.job.check} />}

        {/* Model badge for assistant messages */}
        {!isUser && message.model && (
          <div className="mt-1.5 text-2xs font-mono text-chat-text-muted/50 text-right">
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
