import { useCallback, useRef } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { streamChat } from '@/api/ai';
import { cruxes } from '@/api';
import { applyPalette } from '@/lib/palette';
import type { ChatMessage, ToolCall } from '@/api/types';

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
    setPalette,
  } = useCruxStore();

  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (content: string) => {
      if (!crux || isStreaming) return;

      // Add user message
      const userMsg: ChatMessage = { role: 'user', content };
      addMessage(userMsg);

      // Prepare message history for API
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

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

                // Apply palette immediately on tool_start
                if (event.data.name === 'set_palette') {
                  applyPalette(event.data.input);
                  setPalette(event.data.input);
                }
                break;
              case 'tool_result': {
                // Update the tool call with result
                const tc = toolCalls.find((t) => t.id === event.data.id);
                if (tc) tc.result = event.data.result;

                // Refresh artifacts after file operations
                if (
                  event.data.name === 'write_file' ||
                  event.data.name === 'read_file'
                ) {
                  cruxes.getAttachments(crux.id).then(setArtifacts);
                }

                // Track write_file for gate creation
                if (event.data.name === 'write_file') {
                  hadWriteFile = true;
                }
                break;
              }
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

      // Add assistant message with full content
      if (fullContent) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: fullContent,
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
      setPalette,
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
