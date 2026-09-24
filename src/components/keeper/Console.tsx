import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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

/** Garden Collaboration is a supporting panel; its lifetime is owned by its store. */
function UserAvatar() {
  const author = useAppStore((s) => s.author);
  const avatarUrl = useAvatarUrl(author);
  const initial = author?.username?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className="w-6 h-6 shrink-0 rounded-[var(--radius-sm)] overflow-hidden flex items-center justify-center bg-accent-muted">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-2xs font-body font-bold text-accent">{initial}</span>
      )}
    </div>
  );
}

export default function Console() {
  const [persona, setPersona] = useState<PersonaSettings>(() => getPersona());
  // Read persona on mount (Modal only mounts content when open)
  useEffect(() => {
    setPersona(getPersona());
  }, []);

  const loaded = useKeeperStore((s) => s.loaded);
  const loading = useKeeperStore((s) => s.loading);
  const load = useKeeperStore((s) => s.load);
  const flush = useKeeperStore((s) => s.flush);
  const saveError = useKeeperStore((s) => s.saveError);
  const turnId = useKeeperStore((s) => s.turnId);
  useEffect(() => {
    void load();
  }, [load]);

  // The conversations and the Keeper's turn live in the store, so closing
  // this panel never aborts the Keeper: it keeps working (planting, running a
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

  const input = useKeeperStore((s) => s.draft);
  const setInput = useKeeperStore((s) => s.setDraft);
  const showingTurn = streaming && activeId === turnId;
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
    if (!text || streaming || !loaded) return;
    void sendToKeeper(text);
  }, [input, streaming, loaded, sendToKeeper]);

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
      className="h-full min-h-0"
    >
      <div className="flex flex-row h-full">
        {/* Chat column */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <select
              aria-label="Garden conversation"
              value={activeId ?? ''}
              onChange={(e) => setActive(e.target.value || null)}
              disabled={!loaded}
              className="min-w-0 flex-1 bg-input text-text text-xs rounded-[var(--radius-sm)] p-1.5"
            >
              <option value="" disabled>
                Choose a conversation
              </option>
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              onClick={newConversation}
              disabled={!loaded}
              aria-label="New Conversation"
              className="text-xs text-accent px-1.5 py-1 cursor-pointer"
            >
              New
            </button>
            {activeId && (
              <button
                onClick={() => deleteConversation(activeId)}
                disabled={activeId === turnId}
                aria-label="Delete conversation"
                className="text-xs text-text-muted px-1.5 py-1 cursor-pointer disabled:opacity-40"
              >
                Delete
              </button>
            )}
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {loaded && displayMessages.length === 0 && !showingTurn && (
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
            {showingTurn && (streamContent || toolCalls.length > 0) && (
              <Reply
                avatar={<ConsoleAvatar bordered />}
                name={persona.name || 'The Keeper'}
                content={streamContent}
                toolCalls={toolCalls}
                streaming
              />
            )}

            {/* One quiet line while the Keeper works */}
            {showingTurn && (
              <StatusLine
                text={toolActivity ? `Working… · ${toolActivity}` : 'Working…'}
                testId="keeper-status"
              />
            )}

            <div ref={bottomRef} />
          </div>

          {!loaded && (
            <div role="status" className="px-4 py-2 text-xs text-text-muted">
              {loading ? (
                'Loading conversations…'
              ) : (
                <button onClick={() => void load()}>Try loading again</button>
              )}
            </div>
          )}
          {saveError && (
            <div role="alert" className="px-4 py-2 text-xs text-error">
              {saveError} <button onClick={() => void flush().catch(() => {})}>Retry save</button>
            </div>
          )}
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
              canSend={loaded && !!input.trim()}
              onSend={send}
              onStop={stop}
              hint={streaming ? 'The Keeper is working' : undefined}
              testId="keeper-composer"
              textarea={{
                value: input,
                disabled: !loaded,
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
              <ModelSelector value={model} onChange={changeModel} disabled={!loaded || streaming} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
