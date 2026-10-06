import { useEffect, useMemo, useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { getServices } from '@/services';
import type { Artifact } from '@/api/types';
import { parseShelf, type Shelf } from '@/game/shelf';

/** The Shelf (ADR 0016): the game's shelf file as live data. */

// ── The Shelf (ADR 0016) ─────────────────────────────────────────────────────

export function shelfPathOf(meta: Record<string, unknown> | undefined): string | null {
  const game = meta?.game;
  if (!game || typeof game !== 'object') return null;
  const path = (game as { shelfPath?: unknown }).shelfPath;
  return typeof path === 'string' && path ? path : null;
}

export function useShelfArtifact(path: string): Artifact | null {
  const artifacts = useCruxStore((s) => s.artifacts);
  return useMemo(
    () =>
      artifacts.find((a) => ((a.meta?.path as string | undefined) || a.filename) === path) ?? null,
    [artifacts, path],
  );
}

/** The parsed Shelf at `path`, re-read whenever the file's fingerprint changes. */
export function useShelf(path: string): {
  shelf: Shelf | null;
  error: string | null;
  artifact: Artifact | null;
} {
  const artifact = useShelfArtifact(path);
  const fingerprint = artifact?.fingerprint ?? artifact?.id ?? null;
  const [state, setState] = useState<{ shelf: Shelf | null; error: string | null }>({
    shelf: null,
    error: null,
  });
  useEffect(() => {
    let cancelled = false;
    if (!artifact) {
      setState({ shelf: null, error: null });
      return;
    }
    (async () => {
      try {
        const content = await getServices().artifact.readContent(artifact);
        const shelf = parseShelf(content);
        if (!cancelled) setState({ shelf, error: null });
      } catch (err) {
        if (!cancelled) setState({ shelf: null, error: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact?.id, fingerprint]);
  return { ...state, artifact };
}
