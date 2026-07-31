import { useEffect, type RefObject } from 'react';

/**
 * Dismiss-on-outside-click. Replaces five hand-rolled mousedown listeners
 * (ModelSelector, UserMenu, CruxCard, ContextMenu, ArtifactsPane).
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onDismiss, active]);
}
