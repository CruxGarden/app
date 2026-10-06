import { SnapshotPolicy, type SnapshotFrequency } from './growth';

/**
 * Per-crux Collaboration session state that outlives the pane: the in-flight
 * turn's AbortController, the snapshot policy (which may hold a 2m/5m/10m
 * timer) and the debounced artifact refresh. They belong to the Crux: created
 * on first use, disposed when the workspace closes (cruxStore.reset),
 * untouched by pane mounting.
 */
export interface ChatSession {
  /** The turn currently streaming, if any. */
  turn: AbortController | null;
  policy: SnapshotPolicy;
  refreshTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, ChatSession>();

export function chatSessionFor(
  cruxId: string,
  deps: { frequency: () => SnapshotFrequency; snapshot: () => void | Promise<void> },
): ChatSession {
  let s = sessions.get(cruxId);
  if (!s) {
    s = {
      turn: null,
      policy: new SnapshotPolicy(deps.frequency, deps.snapshot),
      refreshTimer: null,
    };
    sessions.set(cruxId, s);
  }
  return s;
}

/** The workspace is closing: stop the turn, drop timers, forget the session. */
export function disposeChatSession(cruxId: string): void {
  const s = sessions.get(cruxId);
  if (!s) return;
  sessions.delete(cruxId);
  s.turn?.abort();
  s.policy.dispose();
  if (s.refreshTimer) clearTimeout(s.refreshTimer);
}
