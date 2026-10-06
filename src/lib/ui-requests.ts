/**
 * Asking a surface that may not be on screen yet to do something (the command
 * palette's "New Crux…", "New task…"): the request waits until the surface
 * answers — at once when it is already mounted, or when it mounts.
 */
export type UiRequest = 'new-crux' | 'new-task';

const EVENT = 'crux:ui-request';
const pending = new Set<UiRequest>();

export function requestUi(name: UiRequest) {
  pending.add(name);
  document.dispatchEvent(new CustomEvent(EVENT, { detail: name }));
}

/** True once per request: whoever answers it takes it. */
export function takeUiRequest(name: UiRequest): boolean {
  return pending.delete(name);
}

export function onUiRequest(name: UiRequest, fn: () => void): () => void {
  const handler = (event: Event) => {
    if ((event as CustomEvent<UiRequest>).detail === name) fn();
  };
  document.addEventListener(EVENT, handler);
  return () => document.removeEventListener(EVENT, handler);
}
