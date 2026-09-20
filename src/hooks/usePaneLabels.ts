import { useEffect, useState } from 'react';
import { onThemeOverridesChange, onThemePreviewChange } from '@/lib/moods/active';
import { gardenTitle, paneLabels } from '@/lib/pane-labels';
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
  return labels;
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
