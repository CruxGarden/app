import { useCallback, useRef } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { getServices } from '@/services';

/**
 * Returns a function that manually creates a snapshot of the current workspace.
 * Clones all artifacts + creates a growth dimension linking workspace → snapshot.
 */
export function useGrowthCreation() {
  const crux = useCruxStore((s) => s.crux);
  const isCreatingGrowth = useCruxStore((s) => s.isCreatingGrowth);
  const creatingRef = useRef(false);

  const createSnapshot = useCallback(async () => {
    if (!crux || creatingRef.current) return;
    creatingRef.current = true;

    const { setGrowthCreating, addGrowth, saveMeta } = useCruxStore.getState();
    setGrowthCreating(true);

    try {
      const { crux: cruxService, attachment, dimension } = getServices();
      const { growthCount } = useCruxStore.getState();

      // Compute snapshot fingerprint for the current workspace
      const fingerprint = await attachment.computeSnapshotFingerprint(crux.id);

      // Create snapshot crux
      const snapshotSlug = `snapshot-${growthCount + 1}-${Date.now().toString(36)}`;
      const snapshotCrux = await cruxService.create({
        slug: snapshotSlug,
        title: crux.title || 'Snapshot',
        type: 'crux',
        kind: 'snapshot',
        meta: { fingerprint },
      });

      // Clone all workspace artifacts to the snapshot
      await attachment.cloneArtifactsToSnapshot(crux.id, snapshotCrux.id);

      // Create growth dimension linking workspace → snapshot
      const growth = await dimension.create({
        sourceId: crux.id,
        targetId: snapshotCrux.id,
        type: 'growth',
        weight: growthCount + 1,
      });

      addGrowth(growth);
      await saveMeta();
    } catch (err) {
      console.error('Failed to create growth snapshot:', err);
    } finally {
      setGrowthCreating(false);
      creatingRef.current = false;
    }
  }, [crux]);

  return { createSnapshot, isCreatingGrowth };
}
