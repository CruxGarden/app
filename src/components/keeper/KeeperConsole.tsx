import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { ChatMessage } from '@/api/types';
import { PROVIDERS, getProviderForModel } from '@/ai/providers';
import { getAdapter } from '@/ai/adapters';
import type { NormalizedMessage } from '@/services/types';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import ModelSelector from '@/components/chat/ModelSelector';
import KeeperPixelAvatar from '@/components/ui/KeeperPixelAvatar';
import type { KeeperVariant } from '@/components/ui/KeeperPixelAvatar';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useAppStore } from '@/stores/appStore';
import { useThemeStore } from '@/stores/themeStore';
import { getApiKey } from '@/ai/keys';
import { getSetting, setSetting, removeSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { getPersona, type PersonaSettings } from '@/components/mood/MoodEditorPanel';

function useKeeperVariant(): KeeperVariant {
  const activeMode = useThemeStore((s) => s.activeMode);
  return activeMode === 'light' ? 'avatar-light' : 'avatar-dark';
}

export function KeeperAvatar({ className = 'w-6 h-6', animate = false, bordered = false }: { className?: string; animate?: boolean; bordered?: boolean }) {
  const variant = useKeeperVariant();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.1875);

  useEffect(() => {
    if (!containerRef.current) return;
    const size = containerRef.current.clientWidth;
    if (size > 0) setScale(size / 128);
  }, [className]);

  return (
    <div ref={containerRef} className={`${className} aspect-square shrink-0 overflow-hidden ${bordered ? 'rounded-[var(--radius-sm)] ring-1 ring-border' : ''}`}>
      <div className="origin-top-left" style={{ width: 128, height: 128, transform: `scale(${scale})` }}>
        <KeeperPixelAvatar variant={variant} scale={1} gridLines={false} animate={animate} />
      </div>
    </div>
  );
}

const MAX_CONVERSATIONS = 20;
const KEEPER_MODEL = 'claude-sonnet-4-20250514';

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
  } catch { /* ignore */ }
  return [];
}

function saveConversations(convos: Conversation[]) {
  try {
    setSetting(SettingsKey.KeeperConversations, JSON.stringify(convos.slice(0, MAX_CONVERSATIONS)));
  } catch { /* ignore */ }
}

function extractTitle(msgs: { role: string; content: string }[]): string {
  const first = msgs.find((m) => m.role === 'user');
  if (!first) return 'New conversation';
  const text = first.content.trim();
  return text.length > 40 ? text.slice(0, 40) + '…' : text;
}

function formatTime(ts: number): string {
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

function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function getModelShortName(modelId?: string): string | null {
  if (!modelId) return null;
  for (const provider of Object.values(PROVIDERS)) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return model.name;
  }
  return null;
}

// ── Component ──

interface KeeperConsoleProps {
  open: boolean;
  onClose: () => void;
}

function UserAvatar() {
  const author = useAppStore((s) => s.author);
  const avatarUrl = useAvatarUrl(author);
  const initial = author?.username?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className="w-6 h-6 shrink-0 rounded-[var(--radius-sm)] overflow-hidden flex items-center justify-center bg-accent-muted">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] font-display font-bold text-accent">{initial}</span>
      )}
    </div>
  );
}

function PersonaAvatar({ persona, className = 'w-6 h-6' }: { persona: PersonaSettings; className?: string }) {
  if (persona.thumbnailDataUrl) {
    return (
      <div className={`${className} shrink-0 rounded-[var(--radius-sm)] overflow-hidden`}>
        <img src={persona.thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }
  return <KeeperAvatar className={className} />;
}

export default function KeeperConsole({ open, onClose }: KeeperConsoleProps) {
  const keeperVariant = useKeeperVariant();
  const [persona, setPersona] = useState<PersonaSettings>(() => getPersona());

  // Re-read persona when panel opens (user may have changed it)
  useEffect(() => {
    if (open) setPersona(getPersona());
  }, [open]);
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const convos = loadConversations();
    return convos.length > 0 ? convos[0]!.id : null;
  });

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
    setConversations((prev) => {
      const next = [convo, ...prev].slice(0, MAX_CONVERSATIONS);
      saveConversations(next);
      return next;
    });
    setActiveId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(next);
      return next;
    });
    if (activeId === id) {
      setActiveId(() => {
        const remaining = conversations.filter((c) => c.id !== id);
        return remaining.length > 0 ? remaining[0]!.id : null;
      });
    }
  }, [activeId, conversations]);

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [toolActivity, setToolActivity] = useState('');
  const [error, setError] = useState('');
  const [model, setModel] = useState(() => getSetting(SettingsKey.KeeperModel) || KEEPER_MODEL);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, streamContent, toolActivity]);

  // Scroll to bottom when opening with existing history
  useEffect(() => {
    if (open && displayMessages.length > 0) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [open, onClose]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    const providerId = getProviderForModel(model);
    const apiKey = await getApiKey(providerId);
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
      setConversations((prev) => {
        const next = [convo, ...prev].slice(0, MAX_CONVERSATIONS);
        saveConversations(next);
        return next;
      });
      setActiveId(id);
      targetId = id;
    }

    setError('');
    setStreaming(true);
    setStreamContent('');
    setToolActivity('');
    setInput('');

    const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    let currentMessages = [...displayMessages, userMsg];

    // Update title from first user message if still default
    const isFirstMessage = displayMessages.length === 0;

    // Immediately persist user message
    setConversations((prev) => {
      const next = prev.map((c) =>
        c.id === targetId
          ? { ...c, messages: currentMessages, ...(isFirstMessage ? { title: trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed } : {}) }
          : c,
      );
      saveConversations(next);
      return next;
    });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const adapter = await getAdapter(model);
      const normalizedMsgs = toNormalizedMessages(currentMessages);

      const response = await adapter.stream({
        apiKey,
        systemPrompt: persona.systemPrompt || KEEPER_SYSTEM_PROMPT,
        messages: normalizedMsgs,
        model,
        tools: [],
        onText: (text) => setStreamContent(text),
        signal: controller.signal,
      });

      if (response.textContent) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: response.textContent,
          timestamp: new Date().toISOString(),
          model,
        };
        currentMessages = [...currentMessages, assistantMsg];
      }

      // Persist final state
      const tId = targetId;
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === tId ? { ...c, messages: currentMessages } : c,
        );
        saveConversations(next);
        return next;
      });
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        setError(e.message);
      }
    } finally {
      setStreaming(false);
      setStreamContent('');
      setToolActivity('');
      abortRef.current = null;
    }
  }, [input, streaming, displayMessages, activeId, model, persona]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const changeModel = useCallback((m: string) => {
    setModel(m);
    try { setSetting(SettingsKey.KeeperModel, m); } catch { /* ignore */ }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!streaming) send();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-overlay/80 backdrop-blur-sm" onClick={onClose} />

      <div
        className={cn(
          'relative z-10 w-full max-w-2xl mx-4 mb-4 sm:mb-0',
          'bg-keeper-console border border-keeper-console-border rounded-[var(--radius)] shadow-xl',
          'flex flex-row h-[60vh] max-h-[520px]',
        )}
      >
        {/* Sidebar — portrait + conversation history */}
        <div className="hidden sm:flex w-48 shrink-0 flex-col border-r border-border">
          <div className="aspect-square w-full overflow-hidden rounded-tl-[calc(var(--radius)-1px)]">
            {persona.thumbnailDataUrl ? (
              <img src={persona.thumbnailDataUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full overflow-hidden">
                <KeeperPixelAvatar variant={keeperVariant} scale={3} className="w-full h-full" gridLines={false} animate />
              </div>
            )}
          </div>
          {/* Conversation history */}
          <div className="flex-1 min-h-0 overflow-y-auto border-t border-border bg-keeper-console-sidebar">
            <div className="p-2">
              <button
                onClick={startNewConversation}
                className="w-full px-2 py-1.5 mb-2 text-[10px] font-mono text-accent border border-accent/20 hover:bg-accent/10 rounded-[var(--radius-sm)] cursor-pointer transition-colors"
              >
                New Conversation
              </button>
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'group flex items-start gap-1 px-2 py-1.5 rounded-[var(--radius-sm)] cursor-pointer transition-colors',
                    c.id === activeId ? 'bg-accent/10 text-text' : 'text-text-muted hover:bg-accent/10 hover:text-text',
                  )}
                  onClick={() => setActiveId(c.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-mono truncate">{c.title}</p>
                    <p className="text-[9px] font-mono text-text-muted/60">{formatTime(c.createdAt)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-[10px] text-text-muted hover:text-error shrink-0 cursor-pointer transition-opacity"
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
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <PersonaAvatar persona={persona} className="w-7 h-7 sm:hidden" />
            <span className="text-sm font-display font-medium text-text">{persona.name || 'The Keeper'}</span>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {displayMessages.length === 0 && !streaming && (
              <p className="text-xs text-text-muted text-center py-4">
                {persona.greeting || 'The Keeper tends the garden. Ask anything.'}
              </p>
            )}

            {displayMessages.map((msg, i) => (
              <div key={i} className={cn('flex gap-2 items-end', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm break-words',
                    msg.role === 'user' ? 'bg-accent-muted text-text' : 'bg-[color-mix(in_srgb,var(--panel),var(--text)_8%)] text-text',
                  )}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}

                  {/* Metadata footer — timestamp + model */}
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono text-text-muted/50">
                    {msg.timestamp && <span>{formatTimestamp(msg.timestamp)}</span>}
                    {msg.role === 'assistant' && msg.model && (
                      <span className="text-right flex-1">{getModelShortName(msg.model) || msg.model}</span>
                    )}
                  </div>
                </div>
                {msg.role === 'user' && <UserAvatar />}
              </div>
            ))}

            {/* Streaming text */}
            {streaming && streamContent && (
              <div className="flex gap-2 items-end justify-start">
                <div className="max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm bg-[color-mix(in_srgb,var(--panel),var(--text)_8%)] text-text">
                  <MarkdownRenderer content={streamContent} />
                  <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-text-bottom" />
                </div>
              </div>
            )}

            {/* Tool activity indicator */}
            {streaming && toolActivity && (
              <div className="flex gap-2 items-end justify-start">
                <div className="rounded-[var(--radius)] px-3 py-2 bg-[color-mix(in_srgb,var(--panel),var(--text)_8%)] text-xs text-text-muted italic">
                  {toolActivity}
                </div>
              </div>
            )}

            {/* Loading dots */}
            {streaming && !streamContent && !toolActivity && (
              <div className="flex gap-2 items-end justify-start">
                <div className="rounded-[var(--radius)] px-3 py-2 bg-[color-mix(in_srgb,var(--panel),var(--text)_8%)]">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-2 text-xs text-error bg-error-muted border-t border-border">
              {error}
            </div>
          )}

          {/* Input + Model selector */}
          <div className="border-t border-border p-3 space-y-3">
            <ModelSelector value={model} onChange={changeModel} disabled={streaming} />
            <div>
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Send a message..."
                  rows={1}
                  className={cn(
                    'flex-1 resize-none bg-bg border border-accent/20 rounded-[var(--radius-sm)] px-3 py-2',
                    'text-sm text-text placeholder:text-text-muted',
                    'focus:outline-none focus:border-accent',
                    'font-body leading-relaxed max-h-[100px]',
                  )}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
                  }}
                />
                {streaming ? (
                  <button
                    onClick={stop}
                    className={cn(
                      'px-3 py-2 rounded-[var(--radius-sm)] text-sm font-body',
                      'bg-error-muted text-error border border-error/20',
                      'hover:bg-error/20 transition-colors cursor-pointer',
                    )}
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={send}
                    disabled={!input.trim()}
                    className={cn(
                      'px-3 py-2 rounded-[var(--radius-sm)] text-sm font-body',
                      'bg-accent-muted text-accent border border-accent/20',
                      'hover:border-accent transition-colors cursor-pointer',
                      'disabled:opacity-40 disabled:cursor-not-allowed',
                    )}
                  >
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
