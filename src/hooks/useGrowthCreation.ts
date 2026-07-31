import { useCallback, useRef } from 'react';
import { useCruxStore } from '@/stores/cruxStore';

/**
 * Returns a function that manually creates a snapshot of the current workspace.
 * Delegates to the store's createSnapshot action (Growth module underneath).
 */
export function useGrowthCreation() {
  const crux = useCruxStore((s) => s.crux);
  const isCreatingGrowth = useCruxStore((s) => s.isCreatingGrowth);
  const creatingRef = useRef(false);

  const doCreateSnapshot = useCallback(async (label?: string) => {
    if (!crux || creatingRef.current) return;
    creatingRef.current = true;

    const { setGrowthCreating, createSnapshot } = useCruxStore.getState();
    setGrowthCreating(true);

    try {
      await createSnapshot({ label });
    } catch (err) {
      console.error('Failed to create growth snapshot:', err);
    } finally {
      setGrowthCreating(false);
      creatingRef.current = false;
    }
  }, [crux]);

  return { createSnapshot: doCreateSnapshot, isCreatingGrowth };
}
