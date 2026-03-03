import { useCallback, useRef } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { streamChat } from '@/api/ai';
import { cruxes } from '@/api';
import type { ChatMessage, ToolCall } from '@/api/types';

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
 * Build Anthropic-compatible messages with proper tool_use / tool_result blocks.
 * Without this, past tool calls are lost and the model stops using tools.
 */
function buildApiMessages(allMessages: ChatMessage[]) {
  const result: { role: string; content: unknown }[] = [];

  for (let i = 0; i < allMessages.length; i++) {
    const m = allMessages[i]!;

    if (m.role === 'assistant' && m.toolCalls?.length) {
      // Assistant message with tool calls → content block array
      const blocks: Record<string, unknown>[] = [];
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
      const toolResults = m.toolCalls.map((tc, t) => {
        const raw = tc.result || 'Done.';
        return {
          type: 'tool_result' as const,
          tool_use_id: tc.id || `toolu_hist_${i}_${t}`,
          content: truncateToolResult(raw),
        };
      });

      // Merge tool results with the NEXT user message to keep roles alternating
      const next = allMessages[i + 1];
      if (next?.role === 'user') {
        const merged: Record<string, unknown>[] = [...toolResults];
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
    setArtifacts,
    saveMeta,
    setPendingGateCreation,
    addPendingDelete,
  } = useCruxStore();

  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (content: string) => {
      if (!crux || isStreaming) return;

      // Add user message
      const userMsg: ChatMessage = { role: 'user', content };
      addMessage(userMsg);

      // Build message history with proper tool_use / tool_result blocks
      const apiMessages = buildApiMessages([...messages, userMsg]);

      setStreaming(true);
      clearStreamContent();

      const controller = new AbortController();
      abortRef.current = controller;

      let fullContent = '';
      const toolCalls: ToolCall[] = [];
      let hadWriteFile = false;

      try {
        await streamChat(
          crux.id,
          apiMessages,
          (event) => {
            console.log('[SSE]', event.event, event.data);
            switch (event.event) {
              case 'text':
                fullContent += event.data.content;
                appendStreamContent(event.data.content);
                break;
              case 'tool_start':
                toolCalls.push({
                  name: event.data.name,
                  id: event.data.id,
                  input: event.data.input,
                  result: undefined,
                });

                break;
              case 'tool_result': {
                // Update the tool call with result
                const tc = toolCalls.find((t) => t.id === event.data.id);
                if (tc) tc.result = event.data.result;

                // Refresh artifacts after file operations
                if (
                  event.data.name === 'write_file' ||
                  event.data.name === 'edit_file' ||
                  event.data.name === 'delete_file' ||
                  event.data.name === 'read_file'
                ) {
                  const currentCruxId = useCruxStore.getState().crux?.id ?? crux.id;
                  cruxes.getAttachments(currentCruxId).then(
                    (arts) => useCruxStore.getState().setArtifacts(arts),
                    (err) => console.error('Failed to refresh artifacts:', err),
                  );
                }

                // Track file mutations for gate creation
                if (
                  event.data.name === 'write_file' ||
                  event.data.name === 'edit_file' ||
                  event.data.name === 'delete_file'
                ) {
                  hadWriteFile = true;
                }
                break;
              }
              case 'delete_request':
                addPendingDelete(event.data.attachmentId, event.data.path);
                break;
              case 'info':
                console.log('[SSE info]', event.data.message);
                break;
              case 'error':
                fullContent += `\n\n*Error: ${event.data.message}*`;
                break;
              case 'done':
                break;
            }
          },
          crux.meta?.settings?.model,
          controller.signal,
        );
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          fullContent += `\n\n*Error: ${err.message}*`;
        }
      }

      // Add assistant message (always, to prevent consecutive user messages)
      if (fullContent || toolCalls.length > 0) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: fullContent,
          model: crux.meta?.settings?.model,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        };
        addMessage(assistantMsg);
      }

      clearStreamContent();
      setStreaming(false);
      abortRef.current = null;

      // Save messages to crux meta
      await saveMeta();

      // Signal gate creation if artifacts were written
      if (hadWriteFile) {
        setPendingGateCreation(true);
      }
    },
    [
      crux,
      messages,
      isStreaming,
      addMessage,
      setStreaming,
      appendStreamContent,
      clearStreamContent,
      setArtifacts,
      saveMeta,
      setPendingGateCreation,
      addPendingDelete,
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
