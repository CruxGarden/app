import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { getPersona } from '@/services/persona';
import type { ChatMessage } from '@/api/types';
import ToolCallRows from './ToolCallRows';
import { getModelShortName } from '@/ai/providers';
import MarkdownRenderer from './MarkdownRenderer';
import { ConsoleAvatar } from '@/components/keeper/Console';
import { useCruxStore } from '@/stores/cruxStore';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import PersonaAvatar from '@/components/persona/PersonaAvatar';
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
  if (blobUrl) return <PersonaAvatar src={blobUrl} bordered />;
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

  const footer: string[] = [];
  if (!isUser && message.model) footer.push(getModelShortName(message.model) || message.model);

  if (isUser) {
    return (
      <div
        className="flex gap-2 items-end justify-end motion-enter-bubble"
        {...(fromCheck ? { 'data-testid': 'check-message' } : {})}
      >
        <div className="max-w-[82%] min-w-0">
          {authorName && (
            <div className="text-2xs font-mono text-chat-text-muted/80 mb-1 text-right">
              {authorName}
            </div>
          )}
          <div
            className={cn(
              'rounded-bubble px-3.5 py-2 text-sm break-words border',
              'bg-chat-user-bubble text-chat-user-bubble-text border-chat-user-bubble-border',
            )}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
        <UserAvatar message={message} fallbackUrl={avatarUrl} fallbackInitial={userInitial} />
      </div>
    );
  }

  // The collaborator's reply reads like a page: no bubble, the Mood's reading
  // face, the work it did folded beneath it, the record of the turn in a
  // quiet footer line.
  return (
    <div className="flex gap-1.5 items-start motion-enter-bubble" data-role="assistant">
      <div className="pt-0.5">
        <MessageAvatar fingerprint={message.personaFingerprint} />
      </div>
      {/* The reply's border is a rule beside it (transparent unless the Mood colours it). */}
      <div className="min-w-0 flex-1 pl-2 border-l-2 border-chat-ai-bubble-border text-chat-ai-bubble-text">
        {personaName && <div className="text-2xs font-mono text-accent mb-1">{personaName}</div>}
        <div className="font-reading text-[0.95rem] leading-[1.6] break-words">
          <MarkdownRenderer content={message.content} />
        </div>

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2">
            <ToolCallRows calls={message.toolCalls} />
          </div>
        )}

        {/* Background Turn record: "Ran 3 steps · 2 snapshots" (planned turns only —
            a one-step reply reads exactly as it always did) */}
        {message.job && (message.job.steps > 1 || message.job.status !== 'done') && (
          <div
            className="mt-1.5 text-2xs font-mono text-chat-text-muted/70"
            data-testid="turn-summary"
          >
            {describeJobSummary(message.job)}
          </div>
        )}
        {message.job?.check && <CheckLine check={message.job.check} />}

        {footer.length > 0 && (
          <div className="mt-1.5 text-2xs font-mono text-chat-text-muted/50">
            {footer.join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}
