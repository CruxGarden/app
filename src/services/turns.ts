import { useCruxStore } from '@/stores/cruxStore';
import { useAppStore } from '@/stores/appStore';
import { runConversation } from '@/ai/engine';
import { createToolExecutor } from '@/ai/tools';
import { getApiKey } from '@/ai/keys';
import { getProviderForModel, resolveModel } from '@/ai/providers';
import { isAiMock } from '@/lib/platform';
import { playCue, duckAudio } from '@/services/cues';
import { chatSessionFor } from '@/services/chat-session';
import type { SnapshotFrequency } from '@/services/growth';
import { getPersona, getPersonaFingerprint, personaSnapshotOf } from '@/services/persona';
import type { ChatMessage } from '@/api/types';
import type { NormalizedMessage } from '@/services/types';
import {
  isJobActive,
  newTurnJob,
  runTurnJob,
  stampJob,
  type TurnJob,
  type TurnStopReason,
} from './turn-jobs';

/**
 * Background Turns — the wiring (B3). `useChat` used to own the engine loop
 * as an awaited promise inside a React callback; now a turn is a job the
 * store tracks, started here, and the composer stays live throughout.
 *
 * - `submitTurn`: start a job, or QUEUE the message if one is running.
 * - `stopTurn`: abort the running job (marked `interrupted`; its last snapshot
 *   is offered as Restore).
 * - `steerTurn`: stop the running job and start a new one with the message
 *   right away — the partial reply and its tool records are already in the
 *   transcript, so the model continues from what it did, with the new
 *   direction. (Injecting mid-run at the next step boundary would need the
 *   engine to accept messages while streaming; deferred.)
 * - Queued messages run in order after a job finishes `done`. After a stop or
 *   failure they wait for the person ("Run next").
 */

/** Per-crux in-flight run, so steer can wait for the previous job to settle. */
const activeRuns = new Map<string, Promise<void>>();
/** Set before abort so the finaliser knows whether Stop or Steer ended the job. */
const stopReasons = new Map<string, TurnStopReason>();

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
export function buildNormalizedMessages(allMessages: ChatMessage[]): NormalizedMessage[] {
  const result: NormalizedMessage[] = [];

  for (let i = 0; i < allMessages.length; i++) {
    const m = allMessages[i]!;

    if (m.role === 'assistant' && m.toolCalls?.length) {
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
        i++;
      } else {
        result.push({ role: 'user', content: toolResults });
      }
    } else if (m.role === 'user') {
      result.push({ role: 'user', content: m.content || '...' });
    } else {
      result.push({ role: 'assistant', content: m.content || '...' });
    }
  }

  return result;
}

function sessionFor(cruxId: string) {
  // Turn/policy/refresh state lives in a per-crux session (services/chat-session):
  // hiding the pane must not abort the turn.
  return chatSessionFor(cruxId, {
    frequency: () =>
      (useCruxStore.getState().crux?.meta?.settings?.snapshotFrequency as SnapshotFrequency) ||
      'ai-turn',
    snapshot: () => {
      // A timed policy can fire long after the user moved on — snapshotting
      // then would capture a different crux entirely.
      if (useCruxStore.getState().crux?.id !== cruxId) return;
      useCruxStore
        .getState()
        .createSnapshot({ silent: false, ifChanged: true })
        .catch((err) => console.warn('Auto-snapshot failed:', err));
    },
  });
}

/** Send a message: starts a job, or queues it behind the one running. */
export async function submitTurn(content: string): Promise<void> {
  const s = useCruxStore.getState();
  if (!s.crux) return;
  if (isJobActive(s.turnJob) || activeRuns.has(s.crux.id)) {
    s.setTurnQueue([...s.turnQueue, content]);
    await s.persistTurnState();
    return;
  }
  await startTurn(content);
}

/** Stop the running job. Its last snapshot stays restorable from the job card. */
export function stopTurn(reason: TurnStopReason = 'stopped'): void {
  const crux = useCruxStore.getState().crux;
  if (!crux) return;
  const session = sessionFor(crux.id);
  if (!session.turn) return;
  stopReasons.set(crux.id, reason);
  session.turn.abort();
}

/** Stop the running job and start a new one with this message at once. */
export async function steerTurn(content: string): Promise<void> {
  const crux = useCruxStore.getState().crux;
  if (!crux) return;
  const running = activeRuns.get(crux.id);
  if (running) {
    stopTurn('steered');
    await running;
  }
  if (useCruxStore.getState().crux?.id !== crux.id) return;
  await startTurn(content);
}

export async function removeQueued(index: number): Promise<void> {
  const s = useCruxStore.getState();
  s.setTurnQueue(s.turnQueue.filter((_, i) => i !== index));
  await s.persistTurnState();
}

/** Run the first queued message now (after a stop or failure left the queue waiting). */
export async function runNextQueued(): Promise<void> {
  const s = useCruxStore.getState();
  if (!s.crux || isJobActive(s.turnJob) || activeRuns.has(s.crux.id)) return;
  const [next, ...rest] = s.turnQueue;
  if (next === undefined) return;
  s.setTurnQueue(rest);
  await s.persistTurnState();
  await startTurn(next);
}

/** Clear a finished job's card. */
export async function dismissJob(): Promise<void> {
  const s = useCruxStore.getState();
  if (!s.turnJob || isJobActive(s.turnJob)) return;
  s.setTurnJob(null);
  await s.persistTurnState();
}

async function startTurn(content: string): Promise<void> {
  const store = useCruxStore.getState();
  const crux = store.crux;
  if (!crux) return;
  const cruxId = crux.id;

  const model = resolveModel(crux.meta?.settings?.model);
  const providerId = getProviderForModel(model);
  // Under the e2e mock model no provider key is needed.
  const apiKey = (await getApiKey(providerId)) ?? (isAiMock() ? 'mock' : null);

  if (!apiKey) {
    store.addMessage({
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
  store.addMessage(userMsg);

  // Register persona + author snapshots in crux meta (keyed, stored once).
  // Thumbnails/avatars go to OPFS blobs — only fingerprint references in metadata.
  const cruxMeta = useCruxStore.getState().crux?.meta as Record<string, unknown> | undefined;
  let metaChanged = false;

  const personaMap = { ...((cruxMeta?.personaSnapshots as Record<string, unknown>) || {}) };
  if (!personaMap[pf]) {
    personaMap[pf] = personaSnapshotOf(persona);
    metaChanged = true;
  }

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
  // unfingerprinted (legacy) messages too — they belong to the old persona.
  const allMessages = useCruxStore.getState().messages;
  const hasOtherPersona = allMessages.some(
    (m) => m.personaFingerprint && m.personaFingerprint !== pf,
  );
  const personaMessages = allMessages.filter(
    (m) => m.personaFingerprint === pf || (!m.personaFingerprint && !hasOtherPersona),
  );
  const normalizedMessages = buildNormalizedMessages(personaMessages);

  // The job: tracked by the store, persisted so a relaunch reports it.
  const job = newTurnJob(cruxId, content);
  useCruxStore.getState().setTurnJob(job);
  useCruxStore.getState().setStreaming(true);
  useCruxStore.getState().clearStreamContent();
  void duckAudio(true);
  await useCruxStore.getState().persistTurnState();

  const session = sessionFor(cruxId);
  const controller = new AbortController();
  session.turn = controller;
  stopReasons.delete(cruxId);

  const run = runJob({ cruxId, job, apiKey, model, normalizedMessages, pf, controller });
  activeRuns.set(cruxId, run);
  try {
    await run;
  } finally {
    if (activeRuns.get(cruxId) === run) activeRuns.delete(cruxId);
  }
}

async function runJob(args: {
  cruxId: string;
  job: TurnJob;
  apiKey: string;
  model: string;
  normalizedMessages: NormalizedMessage[];
  pf: string;
  controller: AbortController;
}): Promise<void> {
  const { cruxId, apiKey, model, normalizedMessages, pf, controller } = args;
  const session = sessionFor(cruxId);
  const stillHere = () => useCruxStore.getState().crux?.id === cruxId;

  const runTool = createToolExecutor(
    cruxId,
    // Honest delete: block the tool until the user answers the ChatPane
    // confirmation banner; the store performs the deletion on approval.
    (path, artifactId) => useCruxStore.getState().requestDeleteApproval(artifactId, path),
    model,
  );
  // Stop means stop: a provider stream that arrives after the abort must not
  // change files behind the person's back.
  const executeToolFn: typeof runTool = async (name, input) => {
    if (controller.signal.aborted) return 'Error: the turn was stopped before this ran.';
    return runTool(name, input);
  };

  // Per-step snapshots only under the per-turn policy. Timed and manual
  // frequencies keep their meaning: fewer snapshots, decided at the end.
  const perStepSnapshots =
    ((useCruxStore.getState().crux?.meta?.settings?.snapshotFrequency as SnapshotFrequency) ||
      'ai-turn') === 'ai-turn';

  const latestSnapshotId = () => {
    const growths = useCruxStore.getState().growths;
    return growths.length > 0 ? growths[growths.length - 1]!.targetId : null;
  };

  const result = await runTurnJob(args.job, {
    run: () =>
      runConversation(apiKey, cruxId, normalizedMessages, model, executeToolFn, controller.signal),
    update: async (job) => {
      if (!stillHere()) return;
      useCruxStore.getState().setTurnJob(job);
      await useCruxStore.getState().persistTurnState();
    },
    onText: (delta) => {
      if (stillHere()) useCruxStore.getState().appendStreamContent(delta);
    },
    onToolDone: () => void playCue('toolDone'),
    onMutation: () => {
      // Refresh artifacts after mutation operations (debounced to coalesce rapid tool calls)
      if (session.refreshTimer) clearTimeout(session.refreshTimer);
      session.refreshTimer = setTimeout(() => {
        session.refreshTimer = null;
        useCruxStore
          .getState()
          .refreshArtifacts()
          .catch((err) => console.error('Failed to refresh artifacts:', err));
      }, 150);
    },
    onUsage: (i, o, c) => useCruxStore.getState().addTokenUsage(i, o, c),
    snapshot: perStepSnapshots
      ? async (label) => {
          if (!stillHere()) return null;
          const before = latestSnapshotId();
          await useCruxStore.getState().createSnapshot({ label, silent: true, ifChanged: true });
          const after = latestSnapshotId();
          return after && after !== before ? after : null;
        }
      : undefined,
    latestSnapshotId,
    stopReason: () => stopReasons.get(cruxId) ?? null,
    aborted: () => controller.signal.aborted,
  });

  // The workspace may have moved on while this turn streamed (the user
  // opened another crux). Persisting now would file this reply — and its
  // tool records — under the wrong crux, so drop it: the turn's own crux
  // is no longer loaded, and its history stays as it was on disk (the
  // persisted job reports as interrupted on the next load).
  if (!stillHere()) {
    useCruxStore.getState().clearStreamContent();
    useCruxStore.getState().setStreaming(false);
    void duckAudio(false);
    session.turn = null;
    return;
  }

  const { content, toolCalls, job } = result;
  const hasReply = !!content || toolCalls.length > 0;
  if (hasReply) {
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content,
      model,
      timestamp: new Date().toISOString(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      personaFingerprint: pf,
    };
    useCruxStore.getState().addMessage(stampJob(assistantMsg, job));
  }

  useCruxStore.getState().clearStreamContent();
  useCruxStore.getState().setStreaming(false);
  void duckAudio(false);
  if (hasReply) void playCue(job.status === 'failed' ? 'error' : 'message');
  session.turn = null;
  stopReasons.delete(cruxId);

  await useCruxStore.getState().saveMeta();

  // End-of-turn auto-snapshot — only for changes no step snapshot captured,
  // so a planned turn never doubles up on its last step.
  if (result.uncapturedMutation) {
    session.policy.notifyMutation();
  }

  // Queued messages run after a job that finished on its own.
  if (job.status === 'done') {
    const s = useCruxStore.getState();
    const [next, ...rest] = s.turnQueue;
    if (next !== undefined) {
      s.setTurnQueue(rest);
      await s.persistTurnState();
      await startTurn(next);
    }
  }
}
