import { useCallback, useEffect, useRef } from 'react';
import { useCruxStore, cancelPendingDeletes } from '@/stores/cruxStore';
import { getServices } from '@/services';
import { runConversation } from '@/ai/engine';
import { createToolExecutor, didMutate } from '@/ai/tools';
import { getApiKey } from '@/ai/keys';
import { getProviderForModel, resolveModel } from '@/ai/providers';
import { SnapshotPolicy, type SnapshotFrequency } from '@/services/growth';
import type { ChatMessage, ToolCall } from '@/api/types';
import type { NormalizedMessage } from '@/services/types';
import { getPersona, getPersonaFingerprint } from '@/services/persona';
import { useAppStore } from '@/stores/appStore';

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
          tc.name === 'read_file' ? tc.result || 'Done.' : truncateToolResult(tc.result || 'Done.'),
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

  // Auto-snapshot policy (Growth module): reads frequency at decision AND
  // fire time so runtime settings changes are respected.
  const snapshotPolicyRef = useRef<SnapshotPolicy | null>(null);
  if (!snapshotPolicyRef.current) {
    const owningCruxId = crux?.id;
    snapshotPolicyRef.current = new SnapshotPolicy(
      () =>
        (useCruxStore.getState().crux?.meta?.settings?.snapshotFrequency as SnapshotFrequency) ||
        'ai-turn',
      () => {
        // A timed policy can fire long after the user moved on — snapshotting
        // then would capture a different crux entirely.
        if (useCruxStore.getState().crux?.id !== owningCruxId) return;
        useCruxStore
          .getState()
          .createSnapshot({ silent: false })
          .catch((err) => console.warn('Auto-snapshot failed:', err));
      },
    );
  }

  // Tear down anything that outlives the component: a pending snapshot timer,
  // a debounced artifact refresh, an in-flight turn, and any delete request
  // still waiting on the user (which would otherwise hang the tool loop).
  useEffect(() => {
    return () => {
      snapshotPolicyRef.current?.dispose();
      snapshotPolicyRef.current = null;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      abortRef.current?.abort();
      cancelPendingDeletes();
    };
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (!crux || isStreaming) return;

      const model = resolveModel(crux.meta?.settings?.model);
      const providerId = getProviderForModel(model);
      const apiKey = await getApiKey(providerId);

      if (!apiKey) {
        addMessage({
          role: 'assistant',
          content: `No API key configured for ${providerId}. Add one in Settings to start chatting.`,
        });
        return;
      }

      // Add user message stamped with current persona + author ID
      const persona = getPersona();
      const pf = getPersonaFingerprint(persona);
      const author = useAppStore.getState().author;
      const userMsg: ChatMessage = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        personaFingerprint: pf,
        authorId: author?.id,
      };
      addMessage(userMsg);

      // Register persona + author snapshots in crux meta (keyed, stored once).
      // Thumbnails/avatars go to OPFS blobs — only fingerprint references in metadata.
      const cruxMeta = useCruxStore.getState().crux?.meta as Record<string, unknown> | undefined;
      let metaChanged = false;

      // Persona snapshot (keyed by persona fingerprint)
      const personaMap = { ...((cruxMeta?.personaSnapshots as Record<string, unknown>) || {}) };
      if (!personaMap[pf]) {
        personaMap[pf] = {
          name: persona.name,
          greeting: persona.greeting,
          systemPrompt: persona.systemPrompt,
          thumbnailFingerprint: persona.thumbnailFingerprint || null,
          thumbnailFingerprintLight: persona.thumbnailFingerprintLight || null,
        };
        metaChanged = true;
      }

      // Author snapshot (keyed by author UUID)
      const authorMap = { ...((cruxMeta?.authorSnapshots as Record<string, unknown>) || {}) };
      if (author?.id && !authorMap[author.id]) {
        authorMap[author.id] = {
          username: author.username,
          avatarFingerprint: author.meta?.avatarFingerprint || null,
        };
        metaChanged = true;
      }

      if (metaChanged) {
        useCruxStore
          .getState()
          .patchCruxMeta({ personaSnapshots: personaMap, authorSnapshots: authorMap });
      }

      // Build normalized message history — only include messages from the current persona.
      // If any fingerprinted message exists with a different persona, exclude all
      // unfingerpinted (legacy) messages too — they belong to the old persona.
      const allMessages = [...messages, userMsg];
      const hasOtherPersona = allMessages.some(
        (m) => m.personaFingerprint && m.personaFingerprint !== pf,
      );
      const personaMessages = allMessages.filter(
        (m) => m.personaFingerprint === pf || (!m.personaFingerprint && !hasOtherPersona),
      );
      const normalizedMessages = buildNormalizedMessages(personaMessages);

      setStreaming(true);
      clearStreamContent();

      const controller = new AbortController();
      abortRef.current = controller;

      let fullContent = '';
      const toolCalls: ToolCall[] = [];

      try {
        const executeToolFn = createToolExecutor(
          crux.id,
          // Honest delete: block the tool until the user answers the ChatPane
          // confirmation banner; the store performs the deletion on approval.
          (path, artifactId) => useCruxStore.getState().requestDeleteApproval(artifactId, path),
          model,
        );

        for await (const event of runConversation(
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
              if (didMutate(event.name, event.result)) {
                if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = setTimeout(() => {
                  refreshTimerRef.current = null;
                  const { artifact } = getServices();
                  const currentCruxId = useCruxStore.getState().crux?.id ?? crux.id;
                  artifact.findByResource('crux', currentCruxId).then(
                    (arts) => useCruxStore.getState().setArtifacts(arts),
                    (err) => console.error('Failed to refresh artifacts:', err),
                  );
                }, 150);
              }
              break;
            }

            case 'done':
              break;

            case 'usage':
              useCruxStore
                .getState()
                .addTokenUsage(event.inputTokens, event.outputTokens, event.cachedInputTokens);
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

      // The workspace may have moved on while this turn streamed (the user
      // opened another crux). Persisting now would file this reply — and its
      // tool records — under the wrong crux, so drop it: the turn's own crux
      // is no longer loaded, and its history stays as it was on disk.
      if (useCruxStore.getState().crux?.id !== crux.id) {
        clearStreamContent();
        setStreaming(false);
        abortRef.current = null;
        return;
      }

      // Add assistant message (always, to prevent consecutive user messages)
      if (fullContent || toolCalls.length > 0) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: fullContent,
          model,
          timestamp: new Date().toISOString(),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          personaFingerprint: pf,
        };
        addMessage(assistantMsg);
      }

      clearStreamContent();
      setStreaming(false);
      abortRef.current = null;

      // Save messages to crux meta
      await saveMeta();

      // Auto-snapshot trigger — only if this turn actually changed files
      const hadMutations = toolCalls.some((tc) => didMutate(tc.name, tc.result ?? ''));
      if (hadMutations) {
        snapshotPolicyRef.current?.notifyMutation();
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
