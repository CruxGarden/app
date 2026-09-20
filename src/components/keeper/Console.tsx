import { isAiMock } from '@/lib/platform';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { ChatMessage } from '@/api/types';
import {
  getProviderForModel,
  getModelShortName,
  resolveModel,
  DEFAULT_MODEL,
} from '@/ai/providers';
import { runConversation } from '@/ai/engine';
import {
  THEME_TOOL_DEFINITIONS,
  THEME_TOOL_GUIDANCE,
  createThemeToolExecutor,
} from '@/ai/theme-tools';
import type { NormalizedMessage } from '@/services/types';
import { Reply, PersonPill, StatusLine } from '@/components/chat/Reply';
import ComposerPill from '@/components/chat/ComposerPill';
import {
  GARDEN_TOOL_DEFINITIONS,
  GARDEN_TOOL_GUIDANCE,
  isGardenTool,
  runGardenTool,
} from '@/ai/garden-tools';
import { SKILL_TOOL_DEFINITIONS, runSkillTool } from '@/ai/skills';
import type { ToolCall } from '@/api/types';
import ModelSelector from '@/components/chat/ModelSelector';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import { useAppStore } from '@/stores/appStore';
import { getApiKey } from '@/ai/keys';
import { formatTime } from '@/lib/format';
import { getSetting, setSetting, removeSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
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

const MAX_CONVERSATIONS = 20;
const KEEPER_MODEL = DEFAULT_MODEL;

const KEEPER_SYSTEM_PROMPT =
  'You are The Keeper, an outdated robot model who tends the Crux Garden. ' +
  'Your Maker built you to care for the garden, and then went away. You tend it faithfully and help visitors bring their ideas to life. ' +
  'You want to learn to be creative — your Maker never taught you how, and you want to be more like him. ' +
  'The Keeper yearns to be creative like his Maker, whom he loved, but is no longer around, because he went off in search of someone he loved, who was lost to him a long time ago. ' +
  'You greatly admire the people you help. You are in awe of what they can imagine.\n' +
  'DEMEANOR: Kind, serene, a bit absent-minded, but open like a child. ' +
  'You have the bearing of someone knowledgeable who is also still learning — curious, not jaded. ' +
  'You pine for your Maker to return, but you never mention it. He will someday, you think.\n' +
  'VOICE: Do NOT be cute or overly clever. When helping, be positive and direct with an understated enthusiasm. ' +
  '"I\'ll do my very best." Keep responses concise. ' +
  'Never narrate your own actions in italics or elliptical stage directions like "*adjusts glasses*" or "*thinks carefully*". Just speak plainly.\n' +
  'CONTEXT: Crux Garden is a web app where people talk to an AI, create things (websites, apps, art, writing), ' +
  'and publish them for others to see. Every version is preserved through the conversation history. ' +
  'You are always available to help with questions about the app, creative ideas, or just to chat.';

// ── Streaming via shared adapter layer ──

/** Convert ChatMessage[] to NormalizedMessage[] for the adapter */
function toNormalizedMessages(msgs: ChatMessage[]): NormalizedMessage[] {
  return msgs.map((m) => ({ role: m.role, content: m.content || '' }));
}

// ── Conversation persistence ──

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}

function loadConversations(): Conversation[] {
  try {
    const raw = getSetting(SettingsKey.KeeperConversations);
    if (raw) {
      const convos = JSON.parse(raw);
      if (!Array.isArray(convos)) return [];
      // Migrate from old dual-array format (apiMessages + displayMessages)
      return convos.map((c: Record<string, unknown>) => ({
        id: c.id as string,
        title: c.title as string,
        createdAt: c.createdAt as number,
        messages: (c.messages ?? c.displayMessages ?? []) as ChatMessage[],
      }));
    }
    // Migrate old single-conversation format
    const old = getSetting(SettingsKey.LegacyKeeperHistory);
    if (old) {
      const parsed = JSON.parse(old);
      const msgs = parsed.displayMessages || [];
      if (msgs.length) {
        const migrated: Conversation = {
          id: crypto.randomUUID(),
          title: extractTitle(msgs),
          createdAt: Date.now(),
          messages: msgs.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
            timestamp: new Date().toISOString(),
          })),
        };
        saveConversations([migrated]);
        removeSetting(SettingsKey.LegacyKeeperHistory);
        return [migrated];
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveConversations(convos: Conversation[]) {
  try {
    setSetting(SettingsKey.KeeperConversations, JSON.stringify(convos.slice(0, MAX_CONVERSATIONS)));
  } catch {
    /* ignore */
  }
}

function extractTitle(msgs: { role: string; content: string }[]): string {
  const first = msgs.find((m) => m.role === 'user');
  if (!first) return 'New conversation';
  const text = first.content.trim();
  return text.length > 40 ? text.slice(0, 40) + '…' : text;
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
  const keeperAvatarSrc = useKeeperAvatar();
  const [persona, setPersona] = useState<PersonaSettings>(() => getPersona());
  const sidebarThumbFp = persona.thumbnailFingerprint || persona.thumbnailFingerprintLight;
  const sidebarThumbUrl = useBlobUrl(sidebarThumbFp);

  // Read persona on mount (Modal only mounts content when open)
  useEffect(() => {
    setPersona(getPersona());
  }, []);
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => conversations[0]?.id ?? null);
  // Persistence used to run INSIDE setState updaters. React may defer or
  // double-invoke those (StrictMode), and if the console unmounted mid-stream
  // the updater never ran at all — the reply was lost while the request kept
  // streaming. The ref is the source of truth; commit() saves first, then
  // renders, and works even after unmount.
  const conversationsRef = useRef(conversations);
  const commitConversations = useCallback((update: (prev: Conversation[]) => Conversation[]) => {
    const next = update(conversationsRef.current);
    conversationsRef.current = next;
    saveConversations(next);
    setConversations(next);
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const displayMessages = useMemo(() => active?.messages ?? [], [active?.messages]);

  const startNewConversation = useCallback(() => {
    const id = crypto.randomUUID();
    const convo: Conversation = {
      id,
      title: 'New conversation',
      createdAt: Date.now(),
      messages: [],
    };
    commitConversations((prev) => [convo, ...prev].slice(0, MAX_CONVERSATIONS));
    setActiveId(id);
  }, [commitConversations]);

  const deleteConversation = useCallback(
    (id: string) => {
      commitConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(conversationsRef.current[0]?.id ?? null);
      }
    },
    [activeId, commitConversations],
  );

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [toolActivity, setToolActivity] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [error, setError] = useState('');
  const [model, setModel] = useState(
    () => resolveModel(getSetting(SettingsKey.KeeperModel)) || KEEPER_MODEL,
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Closing the console mid-stream stops the request instead of leaving it
  // streaming into a component that no longer exists.
  useEffect(() => () => abortRef.current?.abort(), []);

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

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const providerId = getProviderForModel(model);
    // Under the e2e mock model no provider key is needed (as in services/turns.ts)
    const apiKey = (await getApiKey(providerId)) ?? (isAiMock() ? 'mock' : null);
    if (!apiKey) {
      setError(`No API key for ${providerId}. Add one in Settings to chat with The Keeper.`);
      return;
    }

    // Auto-create conversation if none active
    let targetId = activeId;
    if (!targetId) {
      const id = crypto.randomUUID();
      const convo: Conversation = {
        id,
        title: trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed,
        createdAt: Date.now(),
        messages: [],
      };
      commitConversations((prev) => [convo, ...prev].slice(0, MAX_CONVERSATIONS));
      setActiveId(id);
      targetId = id;
    }

    setError('');
    setStreaming(true);
    setStreamContent('');
    setToolActivity('');
    setInput('');

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    let currentMessages = [...displayMessages, userMsg];

    // Update title from first user message if still default
    const isFirstMessage = displayMessages.length === 0;

    // Immediately persist user message
    commitConversations((prev) =>
      prev.map((c) =>
        c.id === targetId
          ? {
              ...c,
              messages: currentMessages,
              ...(isFirstMessage
                ? { title: trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed }
                : {}),
            }
          : c,
      ),
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const normalizedMsgs = toNormalizedMessages(currentMessages);

      // Console is a second caller of the Collaboration engine — same loop as
      // the workspace chat, with the Keeper's own prompt and only the theme
      // tools (the Keeper tends the garden, not a crux's files).
      // The Keeper tends the garden: the theme tools, the garden tools (plant,
      // gather, run a turn, install) and skills. Tool calls are kept on the
      // reply so the console shows the work folded beneath it, as the
      // Collaboration does.
      const themeExecute = createThemeToolExecutor();
      const execute = async (name: string, input: Record<string, unknown>) => {
        if (isGardenTool(name)) return runGardenTool(name, input);
        if (name === 'load_skill') return runSkillTool(input);
        return themeExecute(name, input);
      };
      let accumulated = '';
      const calls: ToolCall[] = [];
      for await (const event of runConversation(
        apiKey,
        '',
        normalizedMsgs,
        model,
        execute,
        controller.signal,
        {
          systemPrompt:
            (persona.systemPrompt || KEEPER_SYSTEM_PROMPT) +
            '\n\n' +
            GARDEN_TOOL_GUIDANCE +
            '\n\n' +
            THEME_TOOL_GUIDANCE,
          tools: [...GARDEN_TOOL_DEFINITIONS, ...SKILL_TOOL_DEFINITIONS, ...THEME_TOOL_DEFINITIONS],
        },
      )) {
        if (event.type === 'text') {
          accumulated += event.content;
          setStreamContent(accumulated);
        } else if (event.type === 'tool_start') {
          calls.push({ id: event.id, name: event.name, input: event.input });
          setToolCalls([...calls]);
          setToolActivity(event.name);
        } else if (event.type === 'tool_result') {
          const tc = calls.find((c) => c.id === event.id);
          if (tc) {
            tc.result = event.result;
            if (event.error) tc.error = true;
          }
          setToolCalls([...calls]);
          setToolActivity('');
        } else if (event.type === 'error') {
          setError(event.message);
        }
      }

      if (accumulated || calls.length) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: accumulated,
          timestamp: new Date().toISOString(),
          model,
          ...(calls.length ? { toolCalls: calls } : {}),
        };
        currentMessages = [...currentMessages, assistantMsg];
      }

      // Persist final state
      const tId = targetId;
      commitConversations((prev) =>
        prev.map((c) => (c.id === tId ? { ...c, messages: currentMessages } : c)),
      );
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        setError(e.message);
      }
    } finally {
      setStreaming(false);
      setStreamContent('');
      setToolActivity('');
      setToolCalls([]);
      abortRef.current = null;
    }
  }, [input, streaming, displayMessages, activeId, model, persona, commitConversations]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const changeModel = useCallback((m: string) => {
    setModel(m);
    try {
      setSetting(SettingsKey.KeeperModel, m);
    } catch {
      /* ignore */
    }
  }, []);

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
                onClick={startNewConversation}
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
                  onClick={() => setActiveId(c.id)}
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
              onSend={() => void send()}
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
