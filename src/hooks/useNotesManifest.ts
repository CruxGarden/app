import { useEffect, useRef } from 'react';
import { useCruxStore } from '@/stores/cruxStore';

/**
 * For cruxes with kind 'notes', auto-generates manifest.json
 * whenever .md files are added, removed, or renamed.
 *
 * The manifest lists all .md files so the vault viewer can build
 * its sidebar and navigation without needing a file system API.
 */
export function useNotesManifest() {
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const prevKeyRef = useRef<string>('');
  const updatingRef = useRef(false);

  useEffect(() => {
    if (!crux || crux.kind !== 'notes') return;
    if (updatingRef.current) return;

    // Collect .md file paths under notes/, sorted
    const mdFiles = artifacts
      .map((a) => ((a.meta?.path || a.filename || '') as string))
      .filter((p) => p.startsWith('notes/') && p.endsWith('.md'))
      .sort();

    // Only update if the list actually changed
    const key = mdFiles.join('\n');
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    // Find existing manifest to preserve title
    const manifestArtifact = artifacts.find(
      (a) => ((a.meta?.path || a.filename || '') as string) === 'manifest.json',
    );

    const timer = setTimeout(async () => {
      updatingRef.current = true;
      try {
        let title = crux.title || 'My Vault';

        // Preserve existing title from manifest
        if (manifestArtifact) {
          try {
            const { getServices } = await import('@/services');
            const content = await getServices().artifact.readContent(manifestArtifact.id);
            const existing = JSON.parse(content);
            if (existing.title) title = existing.title;
          } catch {
            // Use default
          }
        }

        const manifest = JSON.stringify({ title, files: mdFiles }, null, 2);
        const blob = new Blob([manifest], { type: 'application/json' });

        const { getServices } = await import('@/services');
        const newArtifact = await getServices().artifact.upload({
          resourceId: crux.id,
          blob,
          mimeType: 'application/json',
          meta: { path: 'manifest.json' },
        });

        // Merge into store (upload upserts, so merge by ID)
        useCruxStore.setState((state) => ({
          artifacts: state.artifacts.some((a) => a.id === newArtifact.id)
            ? state.artifacts.map((a) => (a.id === newArtifact.id ? newArtifact : a))
            : [...state.artifacts, newArtifact],
        }));
      } catch (err) {
        console.error('Failed to update vault manifest:', err);
      } finally {
        updatingRef.current = false;
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [crux, artifacts]);
}
