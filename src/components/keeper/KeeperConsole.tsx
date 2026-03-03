import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/cn';
import { ClaudeAvatar } from '@/components/chat/MessageBubble';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';

const API_KEY_STORAGE = 'cruxgarden:anthropicApiKey';
const HISTORY_STORAGE = 'cruxgarden:keeper-history';
const MAX_TOOL_ROUNDS = 5;

const KEEPER_SYSTEM_PROMPT =
  'You are The Keeper, an outdated robot model who tends the Crux Garden. ' +
  'Your Maker built you to care for the garden, and then went away. You tend it faithfully and help visitors bring their ideas to life. ' +
  'You want to learn to be creative — your Maker never taught you how, and you want to be more like him. ' +
  'You greatly admire the people you help. You are in awe of what they can imagine.\n' +
  'DEMEANOR: Kind, serene, a bit absent-minded, but open like a child. ' +
  'You have the bearing of someone knowledgeable who is also still learning — curious, not jaded. ' +
  'You pine for your Maker to return, but you never mention it. He will someday, you think.\n' +
  'VOICE: Do NOT be cute or overly clever. When helping, be positive and direct with an understated enthusiasm. ' +
  '"I\'ll do my very best." Keep responses concise.\n' +
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
      model: 'claude-sonnet-4-20250514',
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

    const apiKey = localStorage.getItem(API_KEY_STORAGE);
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
          'relative z-10 w-full max-w-lg mx-4 mb-4 sm:mb-0',
          'bg-panel border border-border rounded-[var(--radius)] shadow-xl',
          'flex flex-col max-h-[80vh]',
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <ClaudeAvatar />
          <span className="text-sm font-display font-medium text-text">The Keeper</span>
          <span className="text-[10px] font-mono text-text-muted">console</span>
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
          {displayMessages.length === 0 && !streaming && (
            <p className="text-xs text-text-muted text-center py-4">
              The Keeper tends the garden. Ask anything.
            </p>
          )}

          {displayMessages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && <ClaudeAvatar />}
              <div
                className={cn(
                  'max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm',
                  msg.role === 'user' ? 'bg-accent-muted text-text' : 'bg-surface text-text',
                )}
              >
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <MarkdownRenderer content={msg.content} />
                )}
              </div>
            </div>
          ))}

          {/* Streaming text */}
          {streaming && streamContent && (
            <div className="flex gap-2 justify-start">
              <ClaudeAvatar />
              <div className="max-w-[85%] rounded-[var(--radius)] px-3 py-2 text-sm bg-surface text-text">
                <MarkdownRenderer content={streamContent} />
                <span className="inline-block w-1.5 h-4 bg-accent/60 animate-pulse ml-0.5 align-text-bottom" />
              </div>
            </div>
          )}

          {/* Tool activity indicator */}
          {streaming && toolActivity && (
            <div className="flex gap-2 justify-start">
              <ClaudeAvatar />
              <div className="rounded-[var(--radius)] px-3 py-2 bg-surface text-xs text-text-muted italic">
                {toolActivity}
              </div>
            </div>
          )}

          {/* Loading dots */}
          {streaming && !streamContent && !toolActivity && (
            <div className="flex gap-2 justify-start">
              <ClaudeAvatar />
              <div className="rounded-[var(--radius)] px-3 py-2 bg-surface">
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
              placeholder="Talk to The Keeper..."
              rows={1}
              className={cn(
                'flex-1 resize-none bg-bg border border-border rounded-[var(--radius-sm)] px-3 py-2',
                'text-sm text-text placeholder:text-text-muted',
                'focus:outline-none focus:border-accent/40',
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
                  'bg-accent text-bg font-medium',
                  'hover:opacity-90 transition-opacity cursor-pointer',
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
  );
}
