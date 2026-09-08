import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { getServices } from '@/services';
import { pathOf } from '@/lib/artifact-path';

/** A Notes Crux keeps its manifest current even while its builder is hidden. */
export function maintainNotesManifest(
  data: StoreApi<CruxState>,
  track: (p: Promise<unknown>) => void,
) {
  let previous: string | null = null;
  let tail: Promise<void> = Promise.resolve();
  const update = () => {
    const state = data.getState();
    if (state.crux?.kind !== 'notes' || state.closing) return;
    const crux = state.crux;
    const files = (state.workspaceArtifacts ?? state.artifacts)
      .map(pathOf)
      .filter((p) => p.startsWith('notes/') && p.endsWith('.md'))
      .sort();
    const key = files.join('\n');
    if (key === previous) return;
    previous = key;
    tail = tail
      .catch(() => {})
      .then(async () => {
        const { artifact } = getServices();
        const live = data.getState();
        const manifest = (live.workspaceArtifacts ?? live.artifacts).find(
          (a) => pathOf(a) === 'manifest.json',
        );
        let title = crux.title || 'My Vault';
        if (manifest) {
          try {
            title = JSON.parse(await artifact.readContent(manifest.id)).title || title;
          } catch {
            /* keep the Crux title */
          }
        }
        const saved = await artifact.create({
          resourceId: crux.id,
          content: JSON.stringify({ title, files }, null, 2),
          mimeType: 'application/json',
          meta: { path: 'manifest.json' },
        });
        data.getState().upsertArtifact(saved);
      });
    track(tail);
    void tail.catch((error) => console.error('Failed to update vault manifest:', error));
  };
  const off = data.subscribe(update);
  update();
  return off;
}
