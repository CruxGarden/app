import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { getModelShortName } from '@/ai/providers';
import { Reply, PersonPill, StatusLine } from '@/components/chat/Reply';
import ComposerPill from '@/components/chat/ComposerPill';
import ModelSelector from '@/components/chat/ModelSelector';
import { useKeeperStore } from '@/stores/keeperStore';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { useAppStore } from '@/stores/appStore';
import { formatTime } from '@/lib/format';
import { getPersona, type PersonaSettings } from '@/components/mood/mood-helpers';
import PersonaAvatar, { DEFAULT_PERSONA_AVATAR } from '@/components/persona/PersonaAvatar';

/** The face when the persona has none of its own: the bundled Keeper. */
function useKeeperAvatar(): string {
  return DEFAULT_PERSONA_AVATAR;
}

export function ConsoleAvatar({
  className = 'w-6 h-6',
  bordered = false,
}: {
  className?: string;
  bordered?: boolean;
}) {
  const keeperSrc = useKeeperAvatar();
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const handler = () => forceUpdate((n) => n + 1);
    window.addEventListener('crux:persona-changed', handler);
    return () => window.removeEventListener('crux:persona-changed', handler);
  }, []);
  const persona = getPersona();
  // One avatar; a light-mode copy from before 2026-09-07 still shows if that is all there is
  const fp = persona.thumbnailFingerprint || persona.thumbnailFingerprintLight;
  const blobUrl = useBlobUrl(fp);
  return (
    <PersonaAvatar
      src={blobUrl || keeperSrc}
      alt="Console"
      className={className}
      bordered={bordered}
    />
  );
}

/** Relative age for conversation list rows ("just now", "5m ago", "Jul 4") */
function formatRelativeTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

// ── Component ──

// No props — visibility controlled by Modal wrapper in Shell

function UserAvatar() {
  const author = useAppStore((s) => s.author);
  const avatarUrl = useAvatarUrl(author);
  const initial = author?.username?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className="w-6 h-6 shrink-0 rounded-[var(--radius-sm)] overflow-hidden flex items-center justify-center bg-accent-muted">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-2xs font-display font-bold text-accent">{initial}</span>
      )}
    </div>
  );
}

export default function Console() {
  const [persona, setPersona] = useState<PersonaSettings>(() => getPersona());
  const keeperAvatarSrc = useKeeperAvatar();
  const sidebarThumbFp = persona.thumbnailFingerprint || persona.thumbnailFingerprintLight;
  const sidebarThumbUrl = useBlobUrl(sidebarThumbFp);
  // Read persona on mount (Modal only mounts content when open)
  useEffect(() => {
    setPersona(getPersona());
  }, []);

  // The conversations and the Keeper's turn live in the store, so closing
  // this modal never aborts the Keeper: it keeps working (planting, running a
  // turn in a member) and this view catches up when reopened.
  const conversations = useKeeperStore((s) => s.conversations);
  const activeId = useKeeperStore((s) => s.activeId);
  const setActive = useKeeperStore((s) => s.setActive);
  const newConversation = useKeeperStore((s) => s.newConversation);
  const deleteConversation = useKeeperStore((s) => s.deleteConversation);
  const model = useKeeperStore((s) => s.model);
  const changeModel = useKeeperStore((s) => s.setModel);
  const streaming = useKeeperStore((s) => s.streaming);
  const streamContent = useKeeperStore((s) => s.streamContent);
  const toolCalls = useKeeperStore((s) => s.toolCalls);
  const toolActivity = useKeeperStore((s) => s.toolActivity);
  const error = useKeeperStore((s) => s.error);
  const sendToKeeper = useKeeperStore((s) => s.send);
  const stop = useKeeperStore((s) => s.stop);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const displayMessages = useMemo(() => active?.messages ?? [], [active?.messages]);

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, streamContent, toolActivity]);

  // Scroll to bottom on mount when there's existing history
  useEffect(() => {
    if (displayMessages.length > 0) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    void sendToKeeper(text);
  }, [input, streaming, sendToKeeper]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) send();
    }
  };

  return (
    <div
      style={
        {
          // The Keeper's console reads its own token family (console*)
          '--panel': 'var(--console)',
          '--panel-border': 'var(--console-border)',
          '--surface': 'var(--console-sidebar)',
          '--surface-border': 'var(--console-sidebar-border)',
          '--input': 'var(--console-input)',
          '--input-border': 'var(--console-input-border)',
          '--text': 'var(--console-text)',
          '--text-muted': 'var(--console-text-muted)',
        } as React.CSSProperties
      }
    >
      <div className="flex flex-row h-full">
        {/* Sidebar — portrait + conversation history */}
        <div className="hidden sm:flex w-48 shrink-0 flex-col border-r border-border">
          <div className="aspect-square w-full overflow-hidden rounded-tl-[calc(var(--radius)-1px)]">
            <PersonaAvatar
              src={sidebarThumbUrl || keeperAvatarSrc}
              alt="Console"
              className="w-full h-full rounded-none"
            />
          </div>
          {/* Conversation history */}
          <div className="flex-1 min-h-0 overflow-y-auto border-t border-border">
            <div className="p-2">
              <button
                onClick={newConversation}
                className="w-full px-2 py-1.5 mb-2 text-2xs font-mono text-accent border border-accent/20 hover:bg-accent/10 rounded-[var(--radius-sm)] cursor-pointer transition-colors"
              >
                New Conversation
              </button>
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'group flex items-start gap-1 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer transition-colors',
                    c.id === activeId
                      ? 'bg-accent/10 text-text'
                      : 'text-text-muted hover:bg-accent/10 hover:text-text',
                  )}
                  onClick={() => setActive(c.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs font-mono truncate">{c.title}</p>
                    <p className="text-3xs font-mono text-text-muted/60">
                      {formatRelativeTime(c.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-2xs text-text-muted hover:text-error shrink-0 cursor-pointer transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chat column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {displayMessages.length === 0 && !streaming && (
              <p className="text-xs text-text-muted text-center py-4">
                {persona.greeting || 'The Keeper tends the garden. Ask anything.'}
              </p>
            )}

            {displayMessages.map((msg, i) =>
              msg.role === 'user' ? (
                <PersonPill key={i} content={msg.content} avatar={<UserAvatar />} />
              ) : (
                <Reply
                  key={i}
                  avatar={<ConsoleAvatar bordered />}
                  name={persona.name || 'The Keeper'}
                  content={msg.content}
                  toolCalls={msg.toolCalls}
                  footer={[
                    ...(msg.timestamp ? [formatTime(msg.timestamp)] : []),
                    ...(msg.model ? [getModelShortName(msg.model) || msg.model] : []),
                  ]}
                />
              ),
            )}

            {/* The reply as it streams, the work so far folded beneath it */}
            {streaming && (streamContent || toolCalls.length > 0) && (
              <Reply
                avatar={<ConsoleAvatar bordered />}
                name={persona.name || 'The Keeper'}
                content={streamContent}
                toolCalls={toolCalls}
                streaming
              />
            )}

            {/* One quiet line while the Keeper works */}
            {streaming && (
              <StatusLine
                text={toolActivity ? `Working… · ${toolActivity}` : 'Working…'}
                testId="keeper-status"
              />
            )}

            <div ref={bottomRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-2 text-xs text-error bg-error-muted border-t border-border">
              {error}
            </div>
          )}

          {/* The pill composer, the model chip beneath it */}
          <div className="border-t border-border/60">
            <ComposerPill
              textareaRef={inputRef}
              streaming={streaming}
              canSend={!!input.trim()}
              onSend={send}
              onStop={stop}
              hint={
                streaming ? 'The Keeper is working' : 'Enter to send · Shift+Enter for new line'
              }
              testId="keeper-composer"
              textarea={{
                value: input,
                onChange: (e) => setInput(e.target.value),
                onKeyDown: handleKeyDown,
                onInput: (e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
                },
              }}
            />
            <div className="px-3 pb-2">
              <ModelSelector value={model} onChange={changeModel} disabled={streaming} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
