import { useEffect, useMemo, useState } from 'react';
import { useGardenContext } from '@/stores/gardenContext';
import { onThemeOverridesChange, onThemePreviewChange } from '@/lib/moods/active';
import { DEFAULT_PANE_LABELS, gardenTitle, paneLabels } from '@/lib/pane-labels';
import type { PaneType } from '@/stores/uiStore';

/**
 * The garden's names, live: re-read whenever the Mood or its overrides change
 * (a Mood applies its tokens as CSS variables; the names are tokens).
 */
export function usePaneLabels(): Record<PaneType, string> {
  const [labels, setLabels] = useState(() => paneLabels());
  useEffect(() => {
    const refresh = () => setLabels(paneLabels());
    // Tokens land on the document a frame after the change event.
    const later = () => requestAnimationFrame(refresh);
    const offA = onThemeOverridesChange(later);
    const offB = onThemePreviewChange(later);
    document.addEventListener('palette-change', later);
    return () => {
      offA();
      offB();
      document.removeEventListener('palette-change', later);
    };
  }, []);
  // The Garden's own Collaboration says whose it is, beside a Crux's.
  const garden = useGardenContext((s) => s.garden?.title);
  return useMemo(
    () =>
      labels.console === DEFAULT_PANE_LABELS.console
        ? { ...labels, console: `${garden || 'Garden'} · Collaboration` }
        : labels,
    [labels, garden],
  );
}

export function useGardenTitle(): string {
  const [title, setTitle] = useState(() => gardenTitle());
  useEffect(() => {
    const refresh = () => setTitle(gardenTitle());
    const later = () => requestAnimationFrame(refresh);
    const offA = onThemeOverridesChange(later);
    const offB = onThemePreviewChange(later);
    document.addEventListener('palette-change', later);
    return () => {
      offA();
      offB();
      document.removeEventListener('palette-change', later);
    };
  }, []);
  return title;
}
