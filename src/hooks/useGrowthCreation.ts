import { toast } from '@/stores/toastStore';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { useCallback, useRef } from 'react';
import { useCruxStore } from '@/stores/cruxStore';

/**
 * Returns a function that manually creates a snapshot of the current workspace.
 * Delegates to the store's createSnapshot action (Growth module underneath).
 */
export function useGrowthCreation() {
  const cruxStore = useCruxStoreApi();
  const crux = useCruxStore((s) => s.crux);
  const isCreatingGrowth = useCruxStore((s) => s.isCreatingGrowth);
  const creatingRef = useRef(false);

  const doCreateSnapshot = useCallback(
    async (label?: string) => {
      if (!crux || creatingRef.current) return false;
      creatingRef.current = true;

      const { setGrowthCreating, createSnapshot } = cruxStore.getState();
      setGrowthCreating(true);

      try {
        await createSnapshot({ label });
        return true;
      } catch (err) {
        console.error('Failed to create growth snapshot:', err);
        toast(err instanceof Error ? err.message : 'Could not mark this version. Try again.', {
          tone: 'error',
        });
        return false;
      } finally {
        setGrowthCreating(false);
        creatingRef.current = false;
      }
    },
    [crux, cruxStore],
  );

  return { createSnapshot: doCreateSnapshot, isCreatingGrowth };
}
