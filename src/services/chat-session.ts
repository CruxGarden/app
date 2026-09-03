import { SnapshotPolicy, type SnapshotFrequency } from './growth';

/**
 * Per-crux Collaboration session state that must OUTLIVE the chat pane.
 *
 * The in-flight AI turn's AbortController, the auto-snapshot policy (which
 * may hold a 2m/5m/10m timer), and the debounced artifact refresh used to be
 * refs inside the ChatPanel component — so hiding the Collaboration pane
 * mid-turn aborted the turn and dropped the pending snapshot. They belong to
 * the CRUX: created on first use, disposed when the workspace closes
 * (cruxStore.reset), untouched by pane mounting.
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
    s = { turn: null, policy: new SnapshotPolicy(deps.frequency, deps.snapshot), refreshTimer: null };
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
