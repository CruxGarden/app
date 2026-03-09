import { useCallback, useRef } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { getServices } from '@/services';
import { runConversation } from '@/ai/engine';
import { getAdapter } from '@/ai/adapters';
import { createToolExecutor } from '@/ai/tools';
import { getApiKey } from '@/ai/keys';
import { getProviderForModel } from '@/ai/providers';
import type { ChatMessage, ToolCall } from '@/api/types';
import type { NormalizedMessage } from '@/services/types';

/**
 * Truncate large tool results preserving the beginning and end.
 * Better than a flat cut — the model can see the start of the file
 * and the end, with a note about what was omitted.
 */
function truncateToolResult(raw: string, maxLength = 1500): string {
  if (raw.length <= maxLength) return raw;
  const headSize = Math.floor(maxLength * 0.6);
  const tailSize = Math.floor(maxLength * 0.3);
  const head = raw.slice(0, headSize);
  const tail = raw.slice(-tailSize);
  const omitted = raw.length - headSize - tailSize;
  return `${head}\n\n…(${omitted} characters omitted — use read_file to see full contents)…\n\n${tail}`;
}

/**
 * Build normalized messages with proper tool_use / tool_result blocks.
 * Converts ChatMessage[] (with toolCalls array) to NormalizedMessage[]
 * (with content block arrays) for the conversation engine.
 */
function buildNormalizedMessages(allMessages: ChatMessage[]): NormalizedMessage[] {
  const result: NormalizedMessage[] = [];

  for (let i = 0; i < allMessages.length; i++) {
    const m = allMessages[i]!;

    if (m.role === 'assistant' && m.toolCalls?.length) {
      // Assistant message with tool calls → content block array
      const blocks: NormalizedMessage['content'] = [];
      if (m.content?.trim()) {
        blocks.push({ type: 'text', text: m.content });
      }
      for (let t = 0; t < m.toolCalls.length; t++) {
        const tc = m.toolCalls[t]!;
        blocks.push({
          type: 'tool_use',
          id: tc.id || `toolu_hist_${i}_${t}`,
          name: tc.name,
          input: tc.input || {},
        });
      }
      result.push({ role: 'assistant', content: blocks });

      // Build tool_result blocks
      // Never truncate read_file results — the AI needs exact file content
      // to construct accurate old_string matches for edit_file.
      const toolResults = m.toolCalls.map((tc, t) => ({
        type: 'tool_result' as const,
        tool_use_id: tc.id || `toolu_hist_${i}_${t}`,
        content:
          tc.name === 'read_file'
            ? (tc.result || 'Done.')
            : truncateToolResult(tc.result || 'Done.'),
      }));

      // Merge tool results with the NEXT user message to keep roles alternating
      const next = allMessages[i + 1];
      if (next?.role === 'user') {
        const merged: NormalizedMessage['content'] = [...toolResults];
        if (next.content?.trim()) {
          merged.push({ type: 'text', text: next.content });
        }
        result.push({ role: 'user', content: merged });
        i++; // skip the next message, we merged it
      } else {
        result.push({ role: 'user', content: toolResults });
      }
    } else if (m.role === 'user') {
      result.push({ role: 'user', content: m.content || '...' });
    } else {
      // Plain assistant text
      result.push({ role: 'assistant', content: m.content || '...' });
    }
  }

  return result;
}

export function useChat() {
  const {
    crux,
    messages,
    isStreaming,
    streamingContent,
    addMessage,
    setStreaming,
    appendStreamContent,
    clearStreamContent,
    saveMeta,
  } = useCruxStore();

  const abortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(
    async (content: string) => {
      if (!crux || isStreaming) return;

      const model = crux.meta?.settings?.model || 'claude-sonnet-4-20250514';
      const providerId = getProviderForModel(model);
      const apiKey = await getApiKey(providerId);

      if (!apiKey) {
        addMessage({
          role: 'assistant',
          content: `No API key configured for ${providerId}. Add one in Settings to start chatting.`,
        });
        return;
      }

      // Add user message
      const userMsg: ChatMessage = { role: 'user', content, timestamp: new Date().toISOString() };
      addMessage(userMsg);

      // Build normalized message history
      const normalizedMessages = buildNormalizedMessages([...messages, userMsg]);

      setStreaming(true);
      clearStreamContent();

      const controller = new AbortController();
      abortRef.current = controller;

      let fullContent = '';
      const toolCalls: ToolCall[] = [];

      try {
        const adapter = await getAdapter(model);
        const executeToolFn = createToolExecutor(crux.id, async (_path) => {
          // Auto-approve: the AI is instructed to confirm with the user in chat
          // before calling delete_file, so the user's reply is the confirmation.
          return true;
        });

        for await (const event of runConversation(
          adapter,
          apiKey,
          crux.id,
          normalizedMessages,
          model,
          executeToolFn,
          controller.signal,
        )) {
          switch (event.type) {
            case 'text':
              fullContent += event.content;
              appendStreamContent(event.content);
              break;

            case 'tool_start':
              toolCalls.push({
                name: event.name,
                id: event.id,
                input: event.input,
                result: undefined,
              });
              break;

            case 'tool_result': {
              // Update the tool call with result
              const tc = toolCalls.find((t) => t.id === event.id);
              if (tc) tc.result = event.result;

              // Refresh artifacts after mutation operations (debounced to coalesce rapid tool calls)
              if (
                event.name === 'write_file' ||
                event.name === 'edit_file' ||
                event.name === 'delete_file'
              ) {
                if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = setTimeout(() => {
                  refreshTimerRef.current = null;
                  const { attachment } = getServices();
                  const currentCruxId = useCruxStore.getState().crux?.id ?? crux.id;
                  attachment.findByResource('crux', currentCruxId).then(
                    (arts) => useCruxStore.getState().setArtifacts(arts),
                    (err) => console.error('Failed to refresh artifacts:', err),
                  );
                }, 150);
              }
              break;
            }

            case 'done':
              break;

            case 'info':
              // Informational messages (e.g., context trimming) — show inline
              fullContent += `\n\n*${event.message}*`;
              break;

            case 'error':
              fullContent += `\n\n*Error: ${event.message}*`;
              break;
          }
        }
      } catch (err: unknown) {
        const e = err as Error;
        if (e.name !== 'AbortError') {
          fullContent += `\n\n*Error: ${e.message}*`;
        }
      }

      // Add assistant message (always, to prevent consecutive user messages)
      if (fullContent || toolCalls.length > 0) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: fullContent,
          model,
          timestamp: new Date().toISOString(),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        };
        addMessage(assistantMsg);
      }

      clearStreamContent();
      setStreaming(false);
      abortRef.current = null;

      // Save messages to crux meta
      await saveMeta();

    },
    [
      crux,
      messages,
      isStreaming,
      addMessage,
      setStreaming,
      appendStreamContent,
      clearStreamContent,
      saveMeta,
    ],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isStreaming,
    streamingContent,
    send,
    stop,
  };
}
