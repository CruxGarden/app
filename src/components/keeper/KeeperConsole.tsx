import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/cn';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import keeperAvatarDark from '@/images/keeper-avatar-dark.jpg';
import keeperAvatarLight from '@/images/keeper-avatar-light.jpg';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { getApiKey } from '@/ai/keys';

export function KeeperAvatar({ className = 'w-6 h-6' }: { className?: string }) {
  const resolved = useThemeStore((s) => s.resolved);
  const src = resolved === 'dark' ? keeperAvatarDark : keeperAvatarLight;
  return (
    <div className={`${className} shrink-0 rounded-[var(--radius-sm)] overflow-hidden ring-1 ring-border`}>
      <img src={src} alt="The Keeper" className="w-full h-full object-cover" />
    </div>
  );
}

const HISTORY_STORAGE = 'cruxgarden:keeper-history';
const MAX_TOOL_ROUNDS = 5;
const KEEPER_MODEL = 'claude-sonnet-4-20250514';
const KEEPER_MODEL_LABEL = 'Claude Sonnet 4';

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

// No tools — The Keeper is a conversational-only assistant for now.
const KEEPER_TOOLS: any[] = [];

// ── Streaming helper ──

interface ToolCallResult {
  id: string;
  name: string;
  input: Record<string, any>;
}

interface StreamResult {
  text: string;
  toolCalls: ToolCallResult[];
  stopReason: string;
}

async function streamApiCall(
  apiKey: string,
  messages: any[],
  signal: AbortSignal,
  onTextDelta: (fullText: string) => void,
): Promise<StreamResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: KEEPER_MODEL,
      max_tokens: 4096,
      system: KEEPER_SYSTEM_PROMPT,
      ...(KEEPER_TOOLS.length > 0 ? { tools: KEEPER_TOOLS } : {}),
      stream: true,
      messages,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error: ${res.status} ${body.slice(0, 200)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let stopReason = 'end_turn';

  // Track tool_use content blocks by index
  const toolBlocks = new Map<number, { id: string; name: string; inputJson: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6);
      if (dataStr === '[DONE]') continue;

      try {
        const data = JSON.parse(dataStr);

        if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
          toolBlocks.set(data.index, {
            id: data.content_block.id,
            name: data.content_block.name,
            inputJson: '',
          });
        } else if (data.type === 'content_block_delta') {
          if (data.delta?.type === 'text_delta' && data.delta.text) {
            fullText += data.delta.text;
            onTextDelta(fullText);
          } else if (data.delta?.type === 'input_json_delta') {
            const tb = toolBlocks.get(data.index);
            if (tb) tb.inputJson += data.delta.partial_json;
          }
        } else if (data.type === 'message_delta' && data.delta?.stop_reason) {
          stopReason = data.delta.stop_reason;
        }
      } catch {
        // skip malformed
      }
    }
  }

  // Parse accumulated tool inputs
  const toolCalls: ToolCallResult[] = [];
  for (const tb of toolBlocks.values()) {
    let input: Record<string, any> = {};
    if (tb.inputJson) {
      try {
        input = JSON.parse(tb.inputJson);
      } catch {
        // empty or malformed — use empty object
      }
    }
    toolCalls.push({ id: tb.id, name: tb.name, input });
  }

  return { text: fullText, toolCalls, stopReason };
}

// ── Types for API message history ──

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type ApiMessage = { role: 'user' | 'assistant'; content: string | ContentBlock[] };

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Component ──

interface KeeperConsoleProps {
  open: boolean;
  onClose: () => void;
}

function UserAvatar() {
  const author = useAuthStore((s) => s.author);
  const avatarUrl = (() => {
    if (!author?.meta?.avatarUrl) return null;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    return `${base}${author.meta.avatarUrl}?v=${author.updated}`;
  })();
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

export default function KeeperConsole({ open, onClose }: KeeperConsoleProps) {
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE);
      if (saved) return JSON.parse(saved).apiMessages || [];
    } catch { /* ignore */ }
    return [];
  });
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE);
      if (saved) return JSON.parse(saved).displayMessages || [];
    } catch { /* ignore */ }
    return [];
  });
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [toolActivity, setToolActivity] = useState('');
  const [error, setError] = useState('');
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

    const apiKey = await getApiKey('anthropic');
    if (!apiKey) {
      setError('Add your Anthropic API key in Settings to chat with The Keeper.');
      return;
    }

    setError('');
    setStreaming(true);
    setStreamContent('');
    setToolActivity('');
    setInput('');

    // Add user message to both histories
    const userApiMsg: ApiMessage = { role: 'user', content: trimmed };
    const currentApi = [...apiMessages, userApiMsg];
    let currentDisplay = [...displayMessages, { role: 'user' as const, content: trimmed }];
    setApiMessages(currentApi);
    setDisplayMessages(currentDisplay);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let msgs = [...currentApi];
      let finalText = '';

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const result = await streamApiCall(
          apiKey,
          msgs,
          controller.signal,
          (text) => setStreamContent(text),
        );

        // Build assistant content blocks for API history
        const blocks: ContentBlock[] = [];
        if (result.text) blocks.push({ type: 'text', text: result.text });
        for (const tc of result.toolCalls) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        msgs = [...msgs, { role: 'assistant', content: blocks }];

        // No tool calls — we're done
        if (result.stopReason !== 'tool_use' || result.toolCalls.length === 0) {
          finalText = result.text;
          break;
        }

        // Show pre-tool text as a settled message
        if (result.text) {
          currentDisplay = [...currentDisplay, { role: 'assistant' as const, content: result.text }];
          setDisplayMessages(currentDisplay);
        }
        setStreamContent('');

        // Execute tools client-side (none currently defined)
        const toolResults: ContentBlock[] = [];
        for (const tc of result.toolCalls) {
          setToolActivity('Working...');
          toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: `Unknown tool: ${tc.name}` });
        }
        msgs = [...msgs, { role: 'user', content: toolResults }];
        setToolActivity('');
      }

      setApiMessages(msgs);
      if (finalText) {
        currentDisplay = [...currentDisplay, { role: 'assistant' as const, content: finalText }];
        setDisplayMessages(currentDisplay);
      }

      // Persist conversation history
      try {
        localStorage.setItem(HISTORY_STORAGE, JSON.stringify({ apiMessages: msgs, displayMessages: currentDisplay }));
      } catch { /* ignore */ }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setStreaming(false);
      setStreamContent('');
      setToolActivity('');
      abortRef.current = null;
    }
  }, [input, streaming, apiMessages]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearHistory = useCallback(() => {
    setApiMessages([]);
    setDisplayMessages([]);
    try { localStorage.removeItem(HISTORY_STORAGE); } catch { /* ignore */ }
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
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />

      <div
        className={cn(
          'relative z-10 w-full max-w-2xl mx-4 mb-4 sm:mb-0',
          'bg-surface-solid border border-border rounded-[var(--radius)] shadow-xl',
          'flex flex-row h-[60vh] max-h-[520px]',
        )}
      >
        {/* Sidebar portrait */}
        <div className="hidden sm:flex w-44 shrink-0 flex-col border-r border-border">
          <div className="flex-1 min-h-0 overflow-hidden rounded-tl-[var(--radius)]">
            <KeeperAvatar className="w-full h-full !rounded-none !ring-0" />
          </div>
          <div className="px-3 pt-3.5 pb-3 text-center border-t border-border">
            <p className="text-sm font-display font-medium text-text">The Keeper</p>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--brand-ai)">
                <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
              </svg>
              <span className="text-[10px] font-mono text-text-muted">{KEEPER_MODEL_LABEL}</span>
            </div>
          </div>
        </div>

        {/* Chat column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            {/* Show small avatar on mobile where sidebar is hidden */}
            <KeeperAvatar className="w-7 h-7 sm:hidden" />
            <span className="text-sm font-display font-medium text-text sm:hidden">The Keeper</span>
            <span className="text-[10px] font-mono text-text-muted">Console</span>
            <div className="flex-1" />
            {displayMessages.length > 0 && !streaming && (
              <>
                <button
                  onClick={clearHistory}
                  className="text-text-muted hover:text-text transition-colors cursor-pointer text-xs font-mono"
                >
                  clear
                </button>
                <div className="w-px h-4 bg-text-muted/20" />
              </>
            )}
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text transition-colors cursor-pointer text-xs font-mono"
            >
              close
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {displayMessages.length === 0 && !streaming && (
              <p className="text-xs text-text-muted text-center py-4">
                The Keeper tends the garden. Ask anything.
              </p>
            )}

            {displayMessages.map((msg, i) => (
              <div key={i} className={cn('flex gap-2 items-end', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm',
                    msg.role === 'user' ? 'bg-accent-muted text-text' : 'bg-[color-mix(in_srgb,var(--panel),var(--text)_8%)] text-text',
                  )}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}
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

          {/* Input */}
          <div className="border-t border-border p-3">
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
  );
}
