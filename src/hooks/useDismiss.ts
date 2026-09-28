import { useEffect, type RefObject } from 'react';

/**
 * Dismiss on an outside click or on Escape. Replaces five hand-rolled
 * mousedown listeners (ModelSelector, UserMenu, CruxCard, ContextMenu,
 * ArtifactsPane). The Escape is the popup's: it is taken before any global
 * shortcut (the Shell's Escape → Garden Collaboration) can also act on it.
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
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      onDismiss();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escape, true);
    };
  }, [ref, onDismiss, active]);
}
