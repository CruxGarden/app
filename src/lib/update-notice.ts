import type { UpdateState } from './platform';

/**
 * The update notice in the main chrome (EF10): what, if anything, to show for
 * the updater's state. A downloaded update is offered as "Restart to update";
 * an available one, more quietly, as "Download" — and only while the person
 * has the launch check switched on, since with it off they found the update
 * themselves in Settings. "Later" puts a notice away for that version until
 * the app is next started: no nagging.
 */
export interface UpdateNoticeView {
  kind: 'ready' | 'available';
  version: string;
  /** What "Later" remembers. */
  key: string;
}

export function updateNotice(
  state: Pick<UpdateState, 'status' | 'availableVersion' | 'autoCheck'> | null,
  dismissed: ReadonlySet<string> | readonly string[],
): UpdateNoticeView | null {
  const version = state?.availableVersion;
  if (!state || !version) return null;
  const kind =
    state.status === 'downloaded'
      ? 'ready'
      : state.status === 'available' && state.autoCheck
        ? 'available'
        : null;
  if (!kind) return null;
  const key = `${kind}:${version}`;
  const put = Array.isArray(dismissed)
    ? dismissed.includes(key)
    : (dismissed as ReadonlySet<string>).has(key);
  return put ? null : { kind, version, key };
}

// "Later" lasts for the session: the window's sessionStorage where there is
// one (so a reload does not bring the notice back), memory otherwise.
const STORAGE_KEY = 'cruxgarden:update-notice-later';
let memory: string[] | null = null;

export function dismissedUpdateNotices(): string[] {
  if (memory) return memory;
  try {
    const raw: unknown = JSON.parse(globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? '[]');
    memory = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    memory = [];
  }
  return memory;
}

export function dismissUpdateNotice(key: string): string[] {
  const next = [...new Set([...dismissedUpdateNotices(), key])];
  memory = next;
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Memory still holds it for this window. */
  }
  return next;
}

/** Tests only. */
export function resetUpdateNoticeDismissals() {
  memory = null;
  try {
    globalThis.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing stored */
  }
}
