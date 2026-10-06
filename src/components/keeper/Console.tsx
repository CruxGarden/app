import PaneOptions from '@/components/workspace/PaneOptions';
import { automaticModel } from '@/ai/keys';
import { useIncludedAccess } from '@/services/included-access';
import IncludedStatus from '@/components/chat/IncludedStatus';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { buttonClass, linkClass } from '@/components/ui/button-class';
import { onPersonaChange } from '@/services/persona';
import { Avatar } from '@/components/ui';
import { getModelShortName } from '@/ai/providers';
import { Reply, PersonPill, StatusLine } from '@/components/chat/Reply';
import ComposerPill from '@/components/chat/ComposerPill';
import ConversationViewport from '@/components/chat/ConversationViewport';
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
    return onPersonaChange(handler);
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

  return <Avatar url={avatarUrl} initial={initial} />;
}

export default function Console() {
  const [persona, setPersona] = useState<PersonaSettings>(() => getPersona());
  // The pane stays mounted: follow the Mood's Persona tab as it changes.
  useEffect(() => {
    const refresh = () => setPersona(getPersona());
    return onPersonaChange(refresh);
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
  const storedModel = useKeeperStore((s) => s.model);
  const automatic = useKeeperStore((s) => s.modelAutomatic);
  useIncludedAccess();
  const model = automatic ? automaticModel(storedModel) : storedModel;
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || streaming || !loaded) return;
    void sendToKeeper(text);
  }, [input, streaming, loaded, sendToKeeper]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter can commit an IME candidate; it must not send or recall history.
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
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
              className={buttonClass('ghost', 'xs', 'text-accent')}
            >
              New
            </button>
            {activeId && (
              <button
                onClick={() => deleteConversation(activeId)}
                disabled={activeId === turnId}
                aria-label="Delete conversation"
                className={buttonClass('ghost', 'xs', 'text-text-muted hover:text-error')}
              >
                Delete
              </button>
            )}
          </div>
          {/* Messages */}
          <ConversationViewport
            label="Garden conversation messages"
            resetKey={activeId}
            sentCount={displayMessages.filter((message) => message.role === 'user').length}
            className="space-y-3"
          >
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
          </ConversationViewport>

          {!loaded && (
            <div role="status" className="px-4 py-2 text-xs text-text-muted">
              {loading ? (
                'Loading conversations…'
              ) : (
                <button className={linkClass()} onClick={() => void load()}>
                  Try loading again
                </button>
              )}
            </div>
          )}
          {saveError && (
            <div role="alert" className="px-4 py-2 text-xs text-error">
              {saveError}{' '}
              <button className={linkClass()} onClick={() => void flush().catch(() => {})}>
                Retry save
              </button>
            </div>
          )}
          {/* Error */}
          {error && (
            <div className="px-4 py-2 text-xs text-error bg-error-muted border-t border-border">
              {error}
            </div>
          )}

          <p className="text-xs text-text-muted">
            Working across this Garden · open a Crux to work on one creation.
          </p>
          {model === 'garden-included' && <IncludedStatus />}
          {/* The pill composer, the model chip beneath it */}
          <div className="border-t border-border/(--tint-medium)">
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
              <PaneOptions pane="console" label="AI model and options">
                <ModelSelector
                  value={model}
                  onChange={changeModel}
                  disabled={!loaded || streaming}
                />
              </PaneOptions>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
