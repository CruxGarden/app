/**
 * Usage changes (a publish, a sync push/pull/delete) happen in one panel while
 * the meters live in another. A window event keeps them honest without a store.
 */
const EVENT = 'crux:usage-changed';

export function notifyUsageChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function onUsageChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
