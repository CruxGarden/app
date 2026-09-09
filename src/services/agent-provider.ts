import type { ConversationEvent } from '@/ai/engine';
import type { AgentEvent, AgentPermissionRequest, AgentStatus } from '../../electron/src/bridge';
import { Capability, can } from '@/lib/platform';
import { getWorkspace } from '@/stores/workspaceRegistry';

/**
 * Agent Provider (ADR 0019), renderer side. The main process runs Claude Code
 * (services in `electron/src/agent-provider.ts`); this module turns its event
 * stream for one turn into the engine's `ConversationEvent` iterable, so the
 * Background Turn runner treats a Claude Code turn like any other.
 *
 * Two agent-only events are consumed here: `session` (kept in crux meta so the
 * next turn resumes the same Claude Code session) and `result` (the bill,
 * folded into the transcript as one italic line).
 */

function api() {
  return window.electronAPI?.agent ?? null;
}

/** Desktop only, and only when a `claude` binary is on this machine (or the e2e mock). */
export async function agentStatus(force = false): Promise<AgentStatus> {
  const a = api();
  if (!a || !can(Capability.AgentHost))
    return {
      installed: false,
      path: null,
      version: null,
      reason: 'Claude Code runs in the desktop app only.',
    };
  return a.status(force);
}

let statusCache: AgentStatus | null = null;
/** Cached status for synchronous UI decisions; refreshes in the background. */
export function agentStatusCached(): AgentStatus | null {
  void agentStatus().then((s) => {
    statusCache = s;
  });
  return statusCache;
}

export const AGENT_NAME = 'Claude Code';

/**
 * One long-lived subscription for every turn's events, routed by run id.
 * A callback handed across the context bridge per turn is held weakly on the
 * preload side and was collected mid-turn; a module-level handler is not.
 */
const runHandlers = new Map<string, (event: AgentEvent) => void>();
let eventListener: (() => void) | null = null;
function ensureEventListener(): void {
  const a = api();
  if (!a || eventListener) return;
  eventListener = a.onEvent((runId, event) => runHandlers.get(runId)?.(event));
}

/** Permission requests from the main process, answered through the pane's approval banner. */
let permissionListener: (() => void) | null = null;
export function startAgentPermissionListener(): () => void {
  const a = api();
  if (!a || permissionListener) return permissionListener ?? (() => {});
  permissionListener = a.onPermission((request: AgentPermissionRequest) => {
    const ui = getWorkspace(request.cruxId)?.ui;
    if (!ui) {
      a.answer(request.requestId, false);
      return;
    }
    void ui
      .getState()
      .requestAgentApproval({
        agent: AGENT_NAME,
        action: 'tool',
        tool: request.toolName,
        detail: request.summary,
        cruxId: request.cruxId,
      })
      .then((ok) => a.answer(request.requestId, ok));
  });
  return () => {
    permissionListener?.();
    permissionListener = null;
  };
}

export interface AgentTurnOptions {
  cruxId: string;
  cwd: string;
  prompt: string;
  sessionId: string | null;
  appendSystemPrompt?: string;
  signal: AbortSignal;
  /** Called once with the SDK session id, so the crux remembers it. */
  onSession?: (sessionId: string, model: string, version: string) => void;
}

function formatCost(usd: number): string {
  if (usd <= 0) return 'included in your plan';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

/** One Claude Code turn as the engine's event stream. Ends after `done`. */
export async function* runAgentTurn(opts: AgentTurnOptions): AsyncGenerator<ConversationEvent> {
  const a = api();
  if (!a) {
    yield { type: 'error', message: 'Claude Code runs in the desktop app only.' };
    yield { type: 'done', textContent: '', hadMutation: false };
    return;
  }
  const runId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const queue: AgentEvent[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  ensureEventListener();
  runHandlers.set(runId, (event) => {
    queue.push(event);
    wake?.();
  });
  const off = () => runHandlers.delete(runId);
  const onAbort = () => {
    void a.interrupt(runId);
  };
  opts.signal.addEventListener('abort', onAbort, { once: true });
  const running = a
    .start({
      runId,
      cruxId: opts.cruxId,
      cwd: opts.cwd,
      prompt: opts.prompt,
      sessionId: opts.sessionId,
      appendSystemPrompt: opts.appendSystemPrompt,
    })
    .catch((err: unknown) => {
      queue.push({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      queue.push({ type: 'done', textContent: '', hadMutation: false });
    })
    .finally(() => {
      finished = true;
      wake?.();
    });

  // The invoke's reply can reach the renderer BEFORE the events sent during
  // it, so `finished` is not the end: the stream ends on `done`. Once start
  // has resolved, a quiet gap this long means nothing more is coming.
  const TAIL_MS = 2000;
  try {
    while (true) {
      if (queue.length === 0) {
        const more = await new Promise<boolean>((resolve) => {
          wake = () => resolve(true);
          if (finished) setTimeout(() => resolve(false), TAIL_MS);
        });
        wake = null;
        if (!more && queue.length === 0) break;
        continue;
      }
      const event = queue.shift()!;
      if (event.type === 'session') {
        opts.onSession?.(event.sessionId, event.model, event.version);
        continue;
      }
      if (event.type === 'result') {
        const secs = (event.durationMs / 1000).toFixed(1);
        yield {
          type: 'info',
          message: `Claude Code · ${secs}s · ${formatCost(event.costUsd)}`,
        };
        continue;
      }
      yield event;
      if (event.type === 'done') return;
    }
  } finally {
    off();
    opts.signal.removeEventListener('abort', onAbort);
    await running.catch(() => {});
  }
}
