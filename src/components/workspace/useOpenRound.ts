import { useCruxStoreApi } from '@/stores/cruxStore';
import { useCallback } from 'react';
import { useWorkspaceUIStore as useUIStore } from '@/stores/uiStore';
import { alertDialog } from '@/stores/dialogStore';

/** Opening files and the 5Ws round from the Builder. */
/**
 * Start a round (5Ws, ADR 0016): the game is the site's own /play page — a
 * React island that runs the round in the browser with the AI the player
 * connects — so playing from the app means opening that page in the preview.
 * Opening the source file makes the Workshop's astro dev preview show its route.
 */
export const PLAY_PAGE_PATH = 'src/pages/play.astro';

export function useOpenRound() {
  const cruxStore = useCruxStoreApi();
  const openFileByPath = useOpenFileByPath();
  return useCallback(() => {
    const has = cruxStore
      .getState()
      .artifacts.some(
        (a) => ((a.meta?.path as string | undefined) || a.filename) === PLAY_PAGE_PATH,
      );
    if (!has) {
      void alertDialog(
        `This crux has no ${PLAY_PAGE_PATH}. The game page ships with the 5Ws template; add one to play here.`,
        'Start a round',
      );
      return;
    }
    openFileByPath(PLAY_PAGE_PATH);
  }, [cruxStore, openFileByPath]);
}

export function useOpenFileByPath() {
  const cruxStore = useCruxStoreApi();
  const openFile = useUIStore((s) => s.openFile);
  return useCallback(
    (path: string) => {
      const artifact = cruxStore
        .getState()
        .artifacts.find((a) => ((a.meta?.path as string | undefined) || a.filename) === path);
      if (artifact) openFile(artifact.id, path);
    },
    [cruxStore, openFile],
  );
}

// ── Collection cards ─────────────────────────────────────────────────────────
